$ErrorActionPreference = "SilentlyContinue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$launcherPath = (Join-Path $PSScriptRoot "start-c2-stable.ps1").ToLowerInvariant()
$entryPath = (Join-Path $repoRoot "dist\index-http.js").ToLowerInvariant()

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -match "pwsh|powershell" -and
    ($_.CommandLine -as [string]).ToLowerInvariant().Contains($launcherPath)
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    ($_.CommandLine -as [string]).ToLowerInvariant().Contains($entryPath)
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }
