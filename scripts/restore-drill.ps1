[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [string]$IdentityPassword = $env:IDENTITY_DB_PASSWORD,
  [string]$PatientsPassword = $env:PATIENTS_DB_PASSWORD,
  [string]$CatalogsPassword = $env:CATALOGS_DB_PASSWORD,
  [string]$PlatformPassword = $env:PLATFORM_DB_PASSWORD,
  [string]$EncryptionKey = $env:BACKUP_ENCRYPTION_KEY
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$environmentFile = Join-Path $repoRoot ".env"
if (Test-Path -LiteralPath $environmentFile -PathType Leaf) {
  foreach ($line in Get-Content -LiteralPath $environmentFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) { [Environment]::SetEnvironmentVariable($name, $value, "Process") }
  }
}
if (-not $IdentityPassword) { $IdentityPassword = $env:IDENTITY_DB_PASSWORD }
if (-not $PatientsPassword) { $PatientsPassword = $env:PATIENTS_DB_PASSWORD }
if (-not $CatalogsPassword) { $CatalogsPassword = $env:CATALOGS_DB_PASSWORD }
if (-not $PlatformPassword) { $PlatformPassword = $env:PLATFORM_DB_PASSWORD }
if (-not $EncryptionKey) { $EncryptionKey = $env:BACKUP_ENCRYPTION_KEY }
if (@($IdentityPassword, $PatientsPassword, $CatalogsPassword, $PlatformPassword, $EncryptionKey) |
    Where-Object { [string]::IsNullOrWhiteSpace($_) }) {
  throw "Configura las contraseñas SQL y BACKUP_ENCRYPTION_KEY."
}
$env:BACKUP_ENCRYPTION_KEY = $EncryptionKey

$backupPath = [IO.Path]::GetFullPath($BackupDirectory)
if (-not (Test-Path -LiteralPath $backupPath -PathType Container)) { throw "No existe $backupPath" }
$manifestPath = Join-Path $backupPath "manifest.json"
$signaturePath = Join-Path $backupPath "manifest.hmac"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or -not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
  throw "El conjunto de respaldo no contiene un manifiesto firmado."
}

Push-Location $repoRoot
try {
  node scripts/backup-crypto.mjs verify $manifestPath $signaturePath
  if ($LASTEXITCODE -ne 0) { throw "La firma del manifiesto no es válida." }
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 1 -or $manifest.encryption -ne "AES-256-GCM" -or $manifest.databaseCount -ne 12) {
    throw "El manifiesto no describe un respaldo completo compatible."
  }
  $passwords = @{
    "identity-db" = $IdentityPassword
    "patients-db" = $PatientsPassword
    "catalogs-db" = $CatalogsPassword
    "platform-db" = $PlatformPassword
  }
  $expectedTargets = [Collections.Generic.HashSet[string]]::new([string[]]@(
    "identity-db|NutrimejorIdentity", "patients-db|NutrimejorPatients", "catalogs-db|NutrimejorCatalogs",
    "platform-db|NutrimejorSubscriptions", "platform-db|NutrimejorClinical", "platform-db|NutrimejorMeasurements",
    "platform-db|NutrimejorNutrition", "platform-db|NutrimejorPlanning", "platform-db|NutrimejorScheduling",
    "platform-db|NutrimejorNotifications", "platform-db|NutrimejorDocuments", "platform-db|NutrimejorReporting"
  ), [StringComparer]::Ordinal)
  $manifestTargets = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($entry in $manifest.databases) { [void]$manifestTargets.Add("$($entry.service)|$($entry.database)") }
  if ($manifestTargets.Count -ne 12 -or $expectedTargets.Where({ -not $manifestTargets.Contains($_) }).Count -ne 0) {
    throw "El manifiesto no contiene exactamente las doce bases esperadas."
  }

  foreach ($entry in $manifest.databases) {
    if (-not $passwords.ContainsKey($entry.service)) { throw "Servicio no permitido: $($entry.service)" }
    if ($entry.database -notmatch '^Nutrimejor[A-Za-z]+$' -or $entry.file -notmatch '^[A-Za-z0-9-]+--Nutrimejor[A-Za-z]+\.bak\.enc$') {
      throw "Entrada de manifiesto inválida."
    }
    $encryptedFile = Join-Path $backupPath $entry.file
    $plainFile = Join-Path $backupPath ("restore-" + $entry.file.Substring(0, $entry.file.Length - 4))
    if (-not (Test-Path -LiteralPath $encryptedFile -PathType Leaf)) { throw "Falta $encryptedFile" }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $encryptedFile).Hash.ToLowerInvariant() -ne $entry.sha256) {
      throw "SHA-256 cifrado inválido para $($entry.file)."
    }
    $container = (docker compose --profile full ps -q $entry.service).Trim()
    if (-not $container) { throw "El contenedor $($entry.service) no está en ejecución." }
    $containerFile = "/var/opt/mssql/backup/restore-$($entry.database).bak"
    try {
      node scripts/backup-crypto.mjs decrypt $encryptedFile $plainFile
      if ($LASTEXITCODE -ne 0) { throw "No se pudo descifrar $($entry.file)." }
      if ((Get-FileHash -Algorithm SHA256 -LiteralPath $plainFile).Hash.ToLowerInvariant() -ne $entry.plaintextSha256) {
        throw "SHA-256 en claro inválido para $($entry.file)."
      }
      docker exec $container mkdir -p /var/opt/mssql/backup | Out-Null
      docker cp $plainFile "${container}:${containerFile}" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "No se pudo copiar el respaldo al contenedor." }
      $password = $passwords[$entry.service]
      docker exec -e "SQLCMDPASSWORD=$password" $container /opt/mssql-tools18/bin/sqlcmd `
        -S localhost -U sa -C -b -Q "RESTORE VERIFYONLY FROM DISK=N'$containerFile' WITH CHECKSUM" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "RESTORE VERIFYONLY falló para $($entry.database)." }
      $fileList = docker exec -e "SQLCMDPASSWORD=$password" $container /opt/mssql-tools18/bin/sqlcmd `
        -S localhost -U sa -C -b -h -1 -W -s '|' -Q "RESTORE FILELISTONLY FROM DISK=N'$containerFile'"
      if ($LASTEXITCODE -ne 0) { throw "RESTORE FILELISTONLY falló para $($entry.database)." }
      $rows = $fileList | Where-Object { $_ -match '\|' -and $_ -notmatch '^-+\|' }
      $dataRow = $rows | Where-Object { ($_ -split '\|')[2].Trim() -eq 'D' } | Select-Object -First 1
      $logRow = $rows | Where-Object { ($_ -split '\|')[2].Trim() -eq 'L' } | Select-Object -First 1
      if (-not $dataRow -or -not $logRow) { throw "No se obtuvieron los nombres lógicos de $($entry.file)." }
      $logicalData = ($dataRow -split '\|')[0].Trim().Replace("'", "''")
      $logicalLog = ($logRow -split '\|')[0].Trim().Replace("'", "''")
      $drillDb = "$($entry.database)_RestoreCheck"
      $sql = "IF DB_ID(N'$drillDb') IS NOT NULL BEGIN ALTER DATABASE [$drillDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$drillDb]; END; RESTORE DATABASE [$drillDb] FROM DISK=N'$containerFile' WITH MOVE N'$logicalData' TO N'/var/opt/mssql/data/$drillDb.mdf', MOVE N'$logicalLog' TO N'/var/opt/mssql/data/${drillDb}_log.ldf', RECOVERY, CHECKSUM; DBCC CHECKDB(N'$drillDb') WITH NO_INFOMSGS; ALTER DATABASE [$drillDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$drillDb];"
      docker exec -e "SQLCMDPASSWORD=$password" $container /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -Q $sql | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "El simulacro falló para $($entry.database)." }
      Write-Host "OK restauración, checksum e integridad: $($entry.database)"
    }
    finally {
      Remove-Item -LiteralPath $plainFile -Force -ErrorAction SilentlyContinue
      docker exec $container rm -f $containerFile 2>$null | Out-Null
    }
  }
}
finally {
  Pop-Location
}
Write-Host "Simulacro completo para 12 bases cifradas."
