[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet("test", "production")][string]$Environment,
  [string]$TargetTag,
  [string]$EnvironmentFile,
  [ValidateRange(0, 20)][int]$MigrationSteps = 0
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$operatorRoot = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".nutrimejor"
$stateFile = Join-Path $operatorRoot "deploy-state/$Environment.json"
if (-not (Test-Path -LiteralPath $stateFile) -and -not $TargetTag) {
  throw "No existe estado de despliegue; especifica -TargetTag vX.Y.Z."
}
$state = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
if (-not $TargetTag) { $TargetTag = $state.previousTag }
if ($TargetTag -notmatch '^(v\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?|sha-[0-9a-f]{40})$') {
  throw "La versión de rollback no es exacta o no está registrada."
}
if (-not $EnvironmentFile) { $EnvironmentFile = Join-Path $repoRoot "deploy/environments/$Environment.env" }
$EnvironmentFile = [IO.Path]::GetFullPath($EnvironmentFile)
$secretFile = Join-Path $repoRoot ".env"
if (-not (Test-Path -LiteralPath $secretFile) -or -not (Test-Path -LiteralPath $EnvironmentFile)) {
  throw "Faltan .env o el archivo de ambiente."
}

$files = @("docker-compose.yml", "deploy/compose.images.yml", "deploy/compose.$Environment.yml")
$args = @("--env-file", $secretFile, "--env-file", $EnvironmentFile)
foreach ($file in $files) { $args += @("-f", (Join-Path $repoRoot $file)) }
$args += @("--profile", "full")
$services = @("identity-api","patients-api","catalogs-api","subscriptions-api","clinical-api","measurements-api","nutrition-api","planning-api","scheduling-api","notifications-api","documents-api","reporting-api")
$oldTag = $env:IMAGE_TAG
$env:IMAGE_TAG = $TargetTag

Push-Location $repoRoot
try {
  if ($MigrationSteps -gt 0) {
    $reverseServices = [array]$services.Clone()
    [array]::Reverse($reverseServices)
    foreach ($service in $reverseServices) {
      & docker compose @args run --rm --no-deps -T $service node src/migrate.js --down "--steps=$MigrationSteps"
      if ($LASTEXITCODE -ne 0) { throw "Falló el rollback de base de datos en $service." }
    }
  }
  & docker compose @args pull
  if ($LASTEXITCODE -ne 0) { throw "No se pudieron descargar las imágenes $TargetTag." }
  & docker compose @args up -d --no-build --wait --wait-timeout 420
  if ($LASTEXITCODE -ne 0) { throw "No se pudo restaurar la versión $TargetTag." }
  $formerTag = if ($state) { $state.currentTag } else { $null }
  New-Item -ItemType Directory -Path (Split-Path $stateFile) -Force | Out-Null
  [ordered]@{ environment=$Environment; currentTag=$TargetTag; previousTag=$formerTag; deployedAtUtc=[DateTime]::UtcNow.ToString("o"); rollback=$true } |
    ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
  Write-Host "Rollback de $Environment completado a $TargetTag."
}
finally {
  $env:IMAGE_TAG = $oldTag
  Pop-Location
}
