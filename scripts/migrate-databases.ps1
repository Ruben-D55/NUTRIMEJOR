[CmdletBinding()]
param(
  [string[]]$Services = @(
    "identity-api", "patients-api", "catalogs-api", "subscriptions-api",
    "clinical-api", "measurements-api", "nutrition-api", "planning-api",
    "scheduling-api", "notifications-api", "documents-api", "reporting-api"
  )
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$allowed = [Collections.Generic.HashSet[string]]::new(
  [string[]]@(
    "identity-api", "patients-api", "catalogs-api", "subscriptions-api",
    "clinical-api", "measurements-api", "nutrition-api", "planning-api",
    "scheduling-api", "notifications-api", "documents-api", "reporting-api"
  ),
  [StringComparer]::OrdinalIgnoreCase
)

foreach ($service in $Services) {
  if (-not $allowed.Contains($service)) {
    throw "Servicio de migración no permitido: $service"
  }
}

Push-Location $repoRoot
try {
  foreach ($service in $Services) {
    Write-Host "Migrando $service..."
    docker compose --profile full run --rm --no-deps -T $service node src/migrate.js
    if ($LASTEXITCODE -ne 0) {
      throw "Falló la migración de $service."
    }
  }
}
finally {
  Pop-Location
}

Write-Host "Migraciones completadas para $($Services.Count) servicios."
