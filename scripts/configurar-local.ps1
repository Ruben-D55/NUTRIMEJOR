$ErrorActionPreference = "Stop"

Write-Host "Configurando NUTRIMEJOR..." -ForegroundColor Green

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js no está instalado o no aparece en PATH."
}

function Read-WithDefault([string]$Label, [string]$DefaultValue) {
    $value = Read-Host "$Label [$DefaultValue]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $DefaultValue }
    return $value
}

$server = Read-WithDefault "Servidor SQL Server" "localhost"
$port = Read-WithDefault "Puerto SQL Server" "1433"
$database = Read-WithDefault "Nombre de la base" "Nutrimejor"
$user = Read-WithDefault "Usuario SQL Server" "nutrimejor_app"
$securePassword = Read-Host "Contraseña de SQL Server" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $jwtSecret = node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

    $content = @"
DB_SERVER=$server
DB_PORT=$port
DB_NAME=$database
DB_USER=$user
DB_PASSWORD=$password
DB_ENCRYPT=false
DB_TRUST_CERTIFICATE=true
JWT_SECRET=$jwtSecret
NEXT_PUBLIC_APP_URL=http://localhost:3000
"@

    Set-Content -Path ".env.local" -Value $content -Encoding UTF8
    Write-Host "Archivo .env.local creado correctamente." -ForegroundColor Green
    Write-Host "Ahora ejecuta: npm install" -ForegroundColor Cyan
    Write-Host "Después ejecuta: npm run dev" -ForegroundColor Cyan
}
finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $password = $null
}
