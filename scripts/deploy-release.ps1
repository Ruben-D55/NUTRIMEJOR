[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet("test", "production")][string]$Environment,
  [Parameter(Mandatory)][string]$ImageTag,
  [string]$EnvironmentFile,
  [string]$BackupRoot,
  [switch]$SkipBackup,
  [switch]$RollbackMigrationOnFailure
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$releasePattern = '^(v\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?|sha-[0-9a-f]{40})$'
if ($ImageTag -notmatch $releasePattern) {
  throw "IMAGE_TAG debe ser una versión exacta vX.Y.Z o sha-<40 caracteres>."
}

if (-not $EnvironmentFile) {
  $EnvironmentFile = Join-Path $repoRoot "deploy/environments/$Environment.env"
}
$EnvironmentFile = [IO.Path]::GetFullPath($EnvironmentFile)
$secretFile = Join-Path $repoRoot ".env"
if (-not (Test-Path -LiteralPath $secretFile)) { throw "Falta $secretFile con los secretos del ambiente." }
if (-not (Test-Path -LiteralPath $EnvironmentFile)) { throw "Falta $EnvironmentFile. Créalo desde el archivo .example." }

$composeFiles = @(
  Join-Path $repoRoot "docker-compose.yml",
  Join-Path $repoRoot "deploy/compose.images.yml",
  Join-Path $repoRoot "deploy/compose.$Environment.yml"
)
$composeArgs = @("--env-file", $secretFile, "--env-file", $EnvironmentFile)
foreach ($file in $composeFiles) { $composeArgs += @("-f", $file) }
$composeArgs += @("--profile", "full")
$applicationServices = @(
  "identity-api", "patients-api", "catalogs-api", "subscriptions-api",
  "clinical-api", "measurements-api", "nutrition-api", "planning-api",
  "scheduling-api", "notifications-api", "documents-api", "reporting-api",
  "api-gateway", "web", "razor-web"
)
$migrationServices = $applicationServices[0..11]
$operatorRoot = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".nutrimejor"
$stateDirectory = Join-Path $operatorRoot "deploy-state"
$stateFile = Join-Path $stateDirectory "$Environment.json"
$previousTag = $null
if (Test-Path -LiteralPath $stateFile) {
  $previousTag = (Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json).currentTag
}

$oldImageTag = $env:IMAGE_TAG
$oldDeployEnvironment = $env:DEPLOY_ENVIRONMENT
$env:IMAGE_TAG = $ImageTag
$env:DEPLOY_ENVIRONMENT = $Environment

function Invoke-Compose([string[]]$Arguments) {
  & docker compose @composeArgs @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose falló: $($Arguments -join ' ')" }
}

Push-Location $repoRoot
try {
  Invoke-Compose @("config", "--quiet")
  Invoke-Compose (@("pull") + $applicationServices)

  # Las bases y dependencias deben existir antes del trabajo único de migración.
  Invoke-Compose @("up", "-d", "--no-build", "identity-db", "patients-db", "catalogs-db", "platform-db", "rabbitmq", "redis")

  if ($Environment -eq "production" -and -not $SkipBackup) {
    if (-not $BackupRoot) {
      $BackupRoot = if ($env:NUTRIMEJOR_BACKUP_ROOT) { $env:NUTRIMEJOR_BACKUP_ROOT } else { Join-Path $operatorRoot "backups" }
    }
    $oldComposeProject = $env:COMPOSE_PROJECT_NAME
    $env:COMPOSE_PROJECT_NAME = "nutrimejor-$Environment"
    try {
      & (Join-Path $PSScriptRoot "backup-databases.ps1") -OutputRoot $BackupRoot -SkipRetention
      if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el respaldo previo al despliegue." }
    }
    finally { $env:COMPOSE_PROJECT_NAME = $oldComposeProject }
  }

  foreach ($service in $migrationServices) {
    Write-Host "Aplicando migraciones controladas: $service"
    $migrated = $false
    for ($attempt = 1; $attempt -le 12; $attempt++) {
      & docker compose @composeArgs run --rm --no-deps -T $service node src/migrate.js
      if ($LASTEXITCODE -eq 0) { $migrated = $true; break }
      if ($attempt -lt 12) { Start-Sleep -Seconds 5 }
    }
    if (-not $migrated) { throw "Falló la migración de $service después de 12 intentos." }
  }

  Invoke-Compose @("up", "-d", "--no-build", "--remove-orphans", "--wait", "--wait-timeout", "420")

  $appUrl = if ($Environment -eq "production") {
    $domain = (Get-Content -LiteralPath $EnvironmentFile | Where-Object { $_ -match '^APP_DOMAIN=' } | Select-Object -Last 1) -replace '^APP_DOMAIN=', ''
    "https://$domain/login"
  } else {
    $url = (Get-Content -LiteralPath $EnvironmentFile | Where-Object { $_ -match '^APP_URL=' } | Select-Object -Last 1) -replace '^APP_URL=', ''
    "$($url.TrimEnd('/'))/login"
  }
  $healthy = $false
  for ($attempt = 1; $attempt -le 12; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 20
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch {
      if ($attempt -eq 12) { break }
    }
    Start-Sleep -Seconds 5
  }
  if (-not $healthy) { throw "La comprobación final de $appUrl no respondió HTTP 200." }

  New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
  [ordered]@{
    environment = $Environment
    currentTag = $ImageTag
    previousTag = $previousTag
    deployedAtUtc = [DateTime]::UtcNow.ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
  Write-Host "Despliegue $Environment completado con $ImageTag."
}
catch {
  Write-Warning "El despliegue falló: $($_.Exception.Message)"
  if ($RollbackMigrationOnFailure) {
    $reverseServices = [array]$migrationServices.Clone()
    [array]::Reverse($reverseServices)
    foreach ($service in $reverseServices) {
      try { Invoke-Compose @("run", "--rm", "--no-deps", "-T", $service, "node", "src/migrate.js", "--down", "--steps=1") } catch { Write-Warning $_ }
    }
  }
  if ($previousTag) {
    Write-Warning "Restaurando las imágenes anteriores: $previousTag"
    $env:IMAGE_TAG = $previousTag
    try {
      Invoke-Compose (@("pull") + $applicationServices)
      Invoke-Compose @("up", "-d", "--no-build", "--wait", "--wait-timeout", "420")
    } catch { Write-Warning $_ }
  }
  throw
}
finally {
  $env:IMAGE_TAG = $oldImageTag
  $env:DEPLOY_ENVIRONMENT = $oldDeployEnvironment
  Pop-Location
}
