[CmdletBinding()]
param(
  [string]$OutputRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) "backups"),
  [string]$IdentityPassword = $env:IDENTITY_DB_PASSWORD,
  [string]$PatientsPassword = $env:PATIENTS_DB_PASSWORD,
  [string]$CatalogsPassword = $env:CATALOGS_DB_PASSWORD,
  [string]$PlatformPassword = $env:PLATFORM_DB_PASSWORD
)

$ErrorActionPreference = "Stop"
$requiredPasswords = @($IdentityPassword, $PatientsPassword, $CatalogsPassword, $PlatformPassword)
if ($requiredPasswords | Where-Object { [string]::IsNullOrWhiteSpace($_) }) {
  throw "Configura las contraseñas de base de datos mediante variables de entorno."
}

$repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$outputRootPath = [IO.Path]::GetFullPath($OutputRoot)
if (-not $outputRootPath.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputRoot debe estar dentro del repositorio: $repoRoot"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
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

$manifest = @()
Push-Location $repoRoot
try {
  foreach ($target in $targets) {
    $container = (docker compose --profile full ps -q $target.Service).Trim()
    if (-not $container) { throw "El contenedor $($target.Service) no está en ejecución." }

    $fileName = "$($target.Service)--$($target.Database).bak"
    $containerFile = "/var/opt/mssql/backup/$fileName"
    docker exec $container mkdir -p /var/opt/mssql/backup | Out-Null
    docker exec -e "SQLCMDPASSWORD=$($target.Password)" $container /opt/mssql-tools18/bin/sqlcmd `
      -S localhost -U sa -C -b -Q "BACKUP DATABASE [$($target.Database)] TO DISK=N'$containerFile' WITH COPY_ONLY, INIT, CHECKSUM" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falló el respaldo de $($target.Database)." }

    $hostFile = Join-Path $destination $fileName
    docker cp "${container}:${containerFile}" $hostFile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "No se pudo copiar $fileName al host." }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $hostFile).Hash.ToLowerInvariant()
    $manifest += [ordered]@{
      service = $target.Service
      database = $target.Database
      file = $fileName
      bytes = (Get-Item -LiteralPath $hostFile).Length
      sha256 = $hash
      createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    }
    Write-Host "OK $($target.Database) -> $fileName"
  }
}
finally {
  Pop-Location
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $destination "manifest.json")
Write-Host "Respaldo completo: $destination"
