[CmdletBinding()]
param(
  [string]$OutputRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) "backups"),
  [string]$IdentityPassword = $env:IDENTITY_DB_PASSWORD,
  [string]$PatientsPassword = $env:PATIENTS_DB_PASSWORD,
  [string]$CatalogsPassword = $env:CATALOGS_DB_PASSWORD,
  [string]$PlatformPassword = $env:PLATFORM_DB_PASSWORD,
  [string]$EncryptionKey = $env:BACKUP_ENCRYPTION_KEY,
  [int]$DailyRetentionDays = 14,
  [int]$WeeklyRetentionWeeks = 8,
  [int]$MonthlyRetentionMonths = 12,
  [switch]$SkipRetention
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))

function Import-LocalEnvironment {
  $environmentFile = Join-Path $repoRoot ".env"
  if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) { return }
  foreach ($line in Get-Content -LiteralPath $environmentFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

Import-LocalEnvironment
if (-not $IdentityPassword) { $IdentityPassword = $env:IDENTITY_DB_PASSWORD }
if (-not $PatientsPassword) { $PatientsPassword = $env:PATIENTS_DB_PASSWORD }
if (-not $CatalogsPassword) { $CatalogsPassword = $env:CATALOGS_DB_PASSWORD }
if (-not $PlatformPassword) { $PlatformPassword = $env:PLATFORM_DB_PASSWORD }
if (-not $EncryptionKey) { $EncryptionKey = $env:BACKUP_ENCRYPTION_KEY }

$requiredSecrets = @($IdentityPassword, $PatientsPassword, $CatalogsPassword, $PlatformPassword, $EncryptionKey)
if ($requiredSecrets | Where-Object { [string]::IsNullOrWhiteSpace($_) }) {
  throw "Configura las contraseñas SQL y BACKUP_ENCRYPTION_KEY mediante variables de entorno o .env."
}
$normalizedKey = $EncryptionKey.Replace('-', '+').Replace('_', '/')
$normalizedKey = $normalizedKey.PadRight([Math]::Ceiling($normalizedKey.Length / 4) * 4, '=')
if ([Convert]::FromBase64String($normalizedKey).Length -ne 32) {
  throw "BACKUP_ENCRYPTION_KEY debe contener 32 bytes en Base64URL."
}
$env:BACKUP_ENCRYPTION_KEY = $EncryptionKey

$outputRootPath = [IO.Path]::GetFullPath($OutputRoot)
if ([IO.Path]::GetPathRoot($outputRootPath) -eq $outputRootPath) { throw "OutputRoot no puede ser la raíz de una unidad." }
New-Item -ItemType Directory -Force -Path $outputRootPath | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$destination = Join-Path $outputRootPath $timestamp
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$targets = @(
  @{ Service = "identity-db"; Database = "NutrimejorIdentity"; Password = $IdentityPassword },
  @{ Service = "patients-db"; Database = "NutrimejorPatients"; Password = $PatientsPassword },
  @{ Service = "catalogs-db"; Database = "NutrimejorCatalogs"; Password = $CatalogsPassword },
  @{ Service = "platform-db"; Database = "NutrimejorSubscriptions"; Password = $PlatformPassword },
  @{ Service = "platform-db"; Database = "NutrimejorClinical"; Password = $PlatformPassword },
  @{ Service = "platform-db"; Database = "NutrimejorMeasurements"; Password = $PlatformPassword },
  @{ Service = "platform-db"; Database = "NutrimejorNutrition"; Password = $PlatformPassword },
  @{ Service = "platform-db"; Database = "NutrimejorPlanning"; Password = $PlatformPassword },
  @{ Service = "platform-db"; Database = "NutrimejorScheduling"; Password = $PlatformPassword },
  @{ Service = "platform-db"; Database = "NutrimejorNotifications"; Password = $PlatformPassword },
  @{ Service = "platform-db"; Database = "NutrimejorDocuments"; Password = $PlatformPassword },
  @{ Service = "platform-db"; Database = "NutrimejorReporting"; Password = $PlatformPassword }
)

$entries = @()
Push-Location $repoRoot
try {
  foreach ($target in $targets) {
    $container = (docker compose --profile full ps -q $target.Service).Trim()
    if (-not $container) { throw "El contenedor $($target.Service) no está en ejecución." }
    $plainName = "$($target.Service)--$($target.Database).bak"
    $encryptedName = "$plainName.enc"
    $containerFile = "/var/opt/mssql/backup/$plainName"
    $plainFile = Join-Path $destination $plainName
    $encryptedFile = Join-Path $destination $encryptedName
    try {
      docker exec $container mkdir -p /var/opt/mssql/backup | Out-Null
      docker exec -e "SQLCMDPASSWORD=$($target.Password)" $container /opt/mssql-tools18/bin/sqlcmd `
        -S localhost -U sa -C -b -Q "BACKUP DATABASE [$($target.Database)] TO DISK=N'$containerFile' WITH COPY_ONLY, INIT, CHECKSUM, STATS=10" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Falló el respaldo de $($target.Database)." }
      docker cp "${container}:${containerFile}" $plainFile | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "No se pudo copiar $plainName al host." }
      $plainHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $plainFile).Hash.ToLowerInvariant()
      node scripts/backup-crypto.mjs encrypt $plainFile $encryptedFile
      if ($LASTEXITCODE -ne 0) { throw "No se pudo cifrar $plainName." }
      $entries += [ordered]@{
        service = $target.Service
        database = $target.Database
        file = $encryptedName
        bytes = (Get-Item -LiteralPath $encryptedFile).Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $encryptedFile).Hash.ToLowerInvariant()
        plaintextSha256 = $plainHash
      }
      Write-Host "OK respaldo cifrado: $($target.Database)"
    }
    finally {
      Remove-Item -LiteralPath $plainFile -Force -ErrorAction SilentlyContinue
      docker exec $container rm -f $containerFile 2>$null | Out-Null
    }
  }

  $manifest = [ordered]@{
    schemaVersion = 1
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    encryption = "AES-256-GCM"
    databaseCount = $entries.Count
    retention = [ordered]@{ dailyDays = $DailyRetentionDays; weeklyWeeks = $WeeklyRetentionWeeks; monthlyMonths = $MonthlyRetentionMonths }
    databases = $entries
  }
  $manifestPath = Join-Path $destination "manifest.json"
  $signaturePath = Join-Path $destination "manifest.hmac"
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 -LiteralPath $manifestPath
  node scripts/backup-crypto.mjs sign $manifestPath $signaturePath
  if ($LASTEXITCODE -ne 0) { throw "No se pudo firmar el manifiesto." }
}
catch {
  $resolvedDestination = [IO.Path]::GetFullPath($destination)
  if ($resolvedDestination.StartsWith($outputRootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedDestination -Recurse -Force -ErrorAction SilentlyContinue
  }
  throw
}
finally {
  Pop-Location
}

if (-not $SkipRetention) {
  & (Join-Path $PSScriptRoot "backup-retention.ps1") -BackupRoot $outputRootPath `
    -DailyRetentionDays $DailyRetentionDays -WeeklyRetentionWeeks $WeeklyRetentionWeeks -MonthlyRetentionMonths $MonthlyRetentionMonths
}
Write-Host "Respaldo completo: $destination"
Write-Output $destination
