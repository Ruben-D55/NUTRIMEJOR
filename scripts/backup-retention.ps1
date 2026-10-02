[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$BackupRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) "backups"),
  [ValidateRange(1, 3650)][int]$DailyRetentionDays = 14,
  [ValidateRange(1, 520)][int]$WeeklyRetentionWeeks = 8,
  [ValidateRange(1, 120)][int]$MonthlyRetentionMonths = 12,
  [datetime]$NowUtc = [datetime]::UtcNow
)

$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath($BackupRoot)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { return }
if ([IO.Path]::GetPathRoot($root) -eq $root) { throw "BackupRoot no puede ser la raíz de una unidad." }

$candidates = foreach ($directory in Get-ChildItem -LiteralPath $root -Directory) {
  if ($directory.Name -notmatch '^(\d{8})-(\d{6})$') { continue }
  $created = [datetime]::MinValue
  if (-not [datetime]::TryParseExact($directory.Name, "yyyyMMdd-HHmmss", [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$created)) { continue }
  $created = $created.ToUniversalTime()
  [pscustomobject]@{ Directory = $directory; Created = $created }
}
$candidates = @($candidates | Sort-Object Created -Descending)
$keep = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($item in $candidates) {
  if ($item.Created -ge $NowUtc.AddDays(-$DailyRetentionDays)) { [void]$keep.Add($item.Directory.FullName) }
}
$weeklyBoundary = $NowUtc.AddDays(-7 * $WeeklyRetentionWeeks)
$candidates | Where-Object { $_.Created -ge $weeklyBoundary } |
  Group-Object { [Globalization.ISOWeek]::GetYear($_.Created).ToString() + '-' + [Globalization.ISOWeek]::GetWeekOfYear($_.Created).ToString('00') } |
  ForEach-Object { [void]$keep.Add(($_.Group | Sort-Object Created -Descending | Select-Object -First 1).Directory.FullName) }
$monthlyBoundary = $NowUtc.AddMonths(-$MonthlyRetentionMonths)
$candidates | Where-Object { $_.Created -ge $monthlyBoundary } |
  Group-Object { $_.Created.ToString('yyyy-MM') } |
  ForEach-Object { [void]$keep.Add(($_.Group | Sort-Object Created -Descending | Select-Object -First 1).Directory.FullName) }

foreach ($item in $candidates) {
  $resolved = [IO.Path]::GetFullPath($item.Directory.FullName)
  if ($keep.Contains($resolved)) { continue }
  if (-not $resolved.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Ruta fuera de BackupRoot: $resolved"
  }
  if ($PSCmdlet.ShouldProcess($resolved, "Eliminar respaldo fuera de retención")) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
    Write-Host "Eliminado por retención: $($item.Directory.Name)"
  }
}
