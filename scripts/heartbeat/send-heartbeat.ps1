param(
  [Parameter(Mandatory = $false)][string]$Mode = "success",
  [Parameter(Mandatory = $false)][string]$Url,
  [Parameter(Mandatory = $false)][string]$Token,
  [Parameter(Mandatory = $false)][string]$Base,
  [Parameter(Mandatory = $false)][string]$Msg,
  [Parameter(Mandatory = $false)][string]$Ping
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$clientPath = Join-Path $scriptDir "heartbeat-client.mjs"

$argsList = @("$clientPath", "--mode", "$Mode")
if ($Url) { $argsList += @("--url", "$Url") }
if ($Token) { $argsList += @("--token", "$Token") }
if ($Base) { $argsList += @("--base", "$Base") }
if ($Msg) { $argsList += @("--msg", "$Msg") }
if ($Ping) { $argsList += @("--ping", "$Ping") }

node @argsList
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
