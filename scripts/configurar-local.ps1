$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js no está instalado o no aparece en PATH."
}

function New-Secret([int]$Bytes = 48) {
    node -e "console.log(require('crypto').randomBytes($Bytes).toString('base64url'))"
}

function New-SqlPassword {
    "Nm1!" + (New-Secret 24)
}

$serviceKey = New-Secret 48
$jwtSecret = New-Secret 64
$identityPassword = New-SqlPassword
$patientsPassword = New-SqlPassword
$catalogsPassword = New-SqlPassword

$composeEnvironment = @"
SERVICE_API_KEY=$serviceKey
JWT_SECRET=$jwtSecret
IDENTITY_DB_PASSWORD=$identityPassword
PATIENTS_DB_PASSWORD=$patientsPassword
CATALOGS_DB_PASSWORD=$catalogsPassword
"@

$webEnvironment = @"
IDENTITY_API_URL=http://localhost:4001
PATIENTS_API_URL=http://localhost:4002
CATALOGS_API_URL=http://localhost:4003
SERVICE_API_KEY=$serviceKey
SERVICE_TIMEOUT_MS=5000
NEXT_PUBLIC_APP_URL=http://localhost:3000
"@

Set-Content -LiteralPath ".env" -Value $composeEnvironment -Encoding UTF8
Set-Content -LiteralPath ".env.local" -Value $webEnvironment -Encoding UTF8

Write-Host "Configuración local creada para la arquitectura de servicios." -ForegroundColor Green
Write-Host "Ejecuta: docker compose up --build" -ForegroundColor Cyan
