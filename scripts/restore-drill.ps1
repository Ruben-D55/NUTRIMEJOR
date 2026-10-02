[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
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
$backupPath = [IO.Path]::GetFullPath($BackupDirectory)
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot "backups"))
if (-not $backupPath.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "BackupDirectory debe estar dentro de $allowedRoot"
}
$manifestPath = Join-Path $backupPath "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "No existe manifest.json en $backupPath" }

$passwords = @{
  "identity-db" = $IdentityPassword
  "patients-db" = $PatientsPassword
  "catalogs-db" = $CatalogsPassword
  "platform-db" = $PlatformPassword
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

Push-Location $repoRoot
try {
  foreach ($entry in $manifest) {
    if (-not $passwords.ContainsKey($entry.service)) { throw "Servicio no permitido en manifiesto: $($entry.service)" }
    if ($entry.database -notmatch '^Nutrimejor[A-Za-z]+$' -or $entry.file -notmatch '^[A-Za-z0-9-]+--Nutrimejor[A-Za-z]+\.bak$') {
      throw "Entrada de manifiesto inválida para restauración segura."
    }
    $source = Join-Path $backupPath $entry.file
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Falta $source" }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
    if ($actualHash -ne $entry.sha256) { throw "SHA-256 inválido para $($entry.file)" }

    $container = (docker compose --profile full ps -q $entry.service).Trim()
    if (-not $container) { throw "El contenedor $($entry.service) no está en ejecución." }
    $containerFile = "/var/opt/mssql/backup/restore-$($entry.file)"
    docker exec $container mkdir -p /var/opt/mssql/backup | Out-Null
    docker cp $source "${container}:${containerFile}" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "No se pudo copiar $($entry.file) al contenedor." }

    $password = $passwords[$entry.service]
    $fileList = docker exec -e "SQLCMDPASSWORD=$password" $container /opt/mssql-tools18/bin/sqlcmd `
      -S localhost -U sa -C -b -h -1 -W -s '|' -Q "RESTORE FILELISTONLY FROM DISK=N'$containerFile'"
    if ($LASTEXITCODE -ne 0) { throw "RESTORE FILELISTONLY falló para $($entry.database)." }
    $rows = $fileList | Where-Object { $_ -match '\|' -and $_ -notmatch '^-+\|' }
    $dataRow = $rows | Where-Object { ($_ -split '\|')[2].Trim() -eq 'D' } | Select-Object -First 1
    $logRow = $rows | Where-Object { ($_ -split '\|')[2].Trim() -eq 'L' } | Select-Object -First 1
    if (-not $dataRow -or -not $logRow) { throw "No se pudieron obtener los nombres lógicos de $($entry.file)." }
    $logicalData = ($dataRow -split '\|')[0].Trim().Replace("'", "''")
    $logicalLog = ($logRow -split '\|')[0].Trim().Replace("'", "''")
    $drillDb = "$($entry.database)_RestoreCheck"
    $sql = "IF DB_ID(N'$drillDb') IS NOT NULL BEGIN ALTER DATABASE [$drillDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$drillDb]; END; RESTORE DATABASE [$drillDb] FROM DISK=N'$containerFile' WITH MOVE N'$logicalData' TO N'/var/opt/mssql/data/$drillDb.mdf', MOVE N'$logicalLog' TO N'/var/opt/mssql/data/${drillDb}_log.ldf', RECOVERY, CHECKSUM; DBCC CHECKDB(N'$drillDb') WITH NO_INFOMSGS; ALTER DATABASE [$drillDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$drillDb];"
    docker exec -e "SQLCMDPASSWORD=$password" $container /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -Q $sql | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "El simulacro falló para $($entry.database)." }
    docker exec $container rm -f $containerFile | Out-Null
    Write-Host "OK restauración e integridad: $($entry.database)"
  }
}
finally {
  Pop-Location
}

Write-Host "Simulacro de restauración completo para $($manifest.Count) bases."
