param(
  [int]$IntervalSeconds = 30
)

$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$relayScript = Join-Path $repoRoot "relay\relay-host.ps1"
$composeFile = Join-Path $repoRoot "docker-compose.yml"
$containerName = "codex-mcp-server-mcp-server-1"
$relayHealthUrl = "http://127.0.0.1:3099/health"
$mcpHealthUrl = "http://127.0.0.1:3000/health"
$logFile = Join-Path $PSScriptRoot "rex-host-watchdog.log"

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logFile -Value $line
}

function Test-UrlOk {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Ensure-RelayRunning {
  $relayOk = Test-UrlOk -Url $relayHealthUrl
  if ($relayOk) {
    return
  }

  Write-Log "Relay health failed, restarting relay host process."

  $listeners = Get-NetTCPConnection -State Listen -LocalPort 3099 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pid in $listeners) {
    try { Stop-Process -Id $pid -Force -ErrorAction Stop } catch {}
  }

  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File', $relayScript | Out-Null
  Start-Sleep -Seconds 3

  if (Test-UrlOk -Url $relayHealthUrl) {
    Write-Log "Relay recovered."
  } else {
    Write-Log "Relay restart attempted but health still failing."
  }
}

function Ensure-McpRunning {
  $mcpOk = Test-UrlOk -Url $mcpHealthUrl
  if ($mcpOk) {
    return
  }

  Write-Log "MCP health failed, restarting MCP container."
  try {
    docker restart $containerName | Out-Null
  } catch {
    Write-Log "Container restart failed, trying docker compose up -d."
    try {
      docker compose -f $composeFile up -d | Out-Null
    } catch {
      Write-Log ("docker compose up failed: " + $_.Exception.Message)
    }
  }

  Start-Sleep -Seconds 8
  if (Test-UrlOk -Url $mcpHealthUrl) {
    Write-Log "MCP recovered."
  } else {
    Write-Log "MCP restart attempted but health still failing."
  }
}

Write-Log "Rex host watchdog starting."

while ($true) {
  Ensure-RelayRunning
  Ensure-McpRunning
  Start-Sleep -Seconds $IntervalSeconds
}
