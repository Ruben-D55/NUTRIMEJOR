$ErrorActionPreference = "Stop"
function Read-WithDefault([string]$Label,[string]$DefaultValue){$value=Read-Host "$Label [$DefaultValue]";if([string]::IsNullOrWhiteSpace($value)){return $DefaultValue};return $value}
if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw "Node.js no está instalado o no aparece en PATH."}
Write-Host "Configurando NUTRIMEJOR con SQL Server..." -ForegroundColor Green
$server=Read-WithDefault "Servidor SQL Server" "LENOVOW11RYZEN5"
$database=Read-WithDefault "Nombre de la base" "Nutrimejor"
$auth=Read-WithDefault "Autenticación: windows o sql" "windows"
$jwtSecret=node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
if($auth.ToLower()-eq "windows"){
$content=@"
DB_AUTH_MODE=windows
DB_SERVER=$server
DB_NAME=$database
JWT_SECRET=$jwtSecret
NEXT_PUBLIC_APP_URL=http://localhost:3000
"@
}else{
$port=Read-WithDefault "Puerto SQL Server" "1433"
$user=Read-WithDefault "Usuario SQL Server" "nutrimejor_app"
$securePassword=Read-Host "Contraseña de SQL Server" -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try{$password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer);$content=@"
DB_AUTH_MODE=sql
DB_SERVER=$server
DB_PORT=$port
DB_NAME=$database
DB_USER=$user
DB_PASSWORD=$password
DB_ENCRYPT=false
DB_TRUST_CERTIFICATE=true
JWT_SECRET=$jwtSecret
NEXT_PUBLIC_APP_URL=http://localhost:3000
"@}finally{if($pointer-ne[IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)};$password=$null}
}
Set-Content -Path ".env.local" -Value $content -Encoding UTF8
Write-Host ".env.local creado para $server usando autenticación $auth." -ForegroundColor Green
Write-Host "Ejecuta npm install y después npm run dev." -ForegroundColor Cyan
