[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')][string]$At = "02:00",
  [string]$TaskName = "Nutrimejor-Daily-Database-Backup"
)

$ErrorActionPreference = "Stop"
if (-not $IsWindows) { throw "Este instalador usa el Programador de tareas de Windows. En Linux, programe backup-databases.ps1 con systemd o cron." }
$repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$backupScript = Join-Path $PSScriptRoot "backup-databases.ps1"
$powerShell = (Get-Process -Id $PID).Path
$startTime = [datetime]::Today.Add([timespan]::ParseExact($At, "hh\:mm", [Globalization.CultureInfo]::InvariantCulture))
$action = New-ScheduledTaskAction -Execute $powerShell `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$backupScript`"" -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $startTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive -RunLevel Limited

if ($PSCmdlet.ShouldProcess($TaskName, "Registrar respaldo diario a las $At")) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description "Respaldo cifrado diario y retención GFS de las 12 bases NUTRIMEJOR." -Force | Out-Null
  Write-Host "Tarea registrada: $TaskName a las $At (inicio diferido habilitado)."
}
