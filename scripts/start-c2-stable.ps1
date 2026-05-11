$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot "data\runtime"
$logPath = Join-Path $runtimeDir "c2-stable.log"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$entry = Join-Path $repoRoot "dist\index-http.js"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $logPath -Value "[$timestamp] $Message"
}

$telegramVars = @(
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_TOKENS",
  "ABDI_TELEGRAM_BOT_TOKEN",
  "AHMED_TELEGRAM_BOT_TOKEN",
  "DAME_TELEGRAM_BOT_TOKEN",
  "REX_TELEGRAM_BOT_TOKEN",
  "PRIME_TELEGRAM_BOT_TOKEN",
  "ATLAS_TELEGRAM_BOT_TOKEN",
  "AYUB_TELEGRAM_BOT_TOKEN",
  "SYGMA_TELEGRAM_BOT_TOKEN"
)

$env:HTTP_PORT = "3000"
$env:HTTP_HOST = "0.0.0.0"
$env:HTTP_CORS_ORIGIN = "*"
$env:DESKTOP_RELAY_URL = ""
$env:RELAY_TARGET = ""
foreach ($name in $telegramVars) {
  Set-Item -Path "Env:$name" -Value ""
}

# Auto-refresh Google Drive access token on startup using refresh token
function Refresh-GoogleToken {
  $clientId     = $env:GOOGLE_CLIENT_ID
  $clientSecret = $env:GOOGLE_CLIENT_SECRET
  $refreshToken = $env:GOOGLE_REFRESH_TOKEN
  if (-not ($clientId -and $clientSecret -and $refreshToken)) { return }
  try {
    $body = "client_id=$clientId&client_secret=$clientSecret&refresh_token=$refreshToken&grant_type=refresh_token"
    $r = Invoke-RestMethod -Uri "https://oauth2.googleapis.com/token" -Method POST `
         -ContentType "application/x-www-form-urlencoded" -Body $body -ErrorAction Stop
    if ($r.access_token) {
      $env:GOOGLE_DRIVE_ACCESS_TOKEN = $r.access_token
      # Persist back to .env file
      $envPath = Join-Path $repoRoot ".env"
      if (Test-Path $envPath) {
        $content = Get-Content $envPath -Raw
        $content = [regex]::Replace($content, "(?m)^GOOGLE_DRIVE_ACCESS_TOKEN=.*$", "GOOGLE_DRIVE_ACCESS_TOKEN=$($r.access_token)")
        Set-Content $envPath $content -NoNewline
      }
      Write-Log "Google Drive access token refreshed (expires in $($r.expires_in)s)."
    }
  } catch {
    Write-Log "Google Drive token refresh failed: $($_.Exception.Message)"
  }
}

Write-Log "Stable C2 launcher started."

# Start Cloudflare tunnel
$cfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$cfToken = "eyJhIjoiMjk4YzM5ZDhkYmJjNjY0ZTlmZWU2Yzc2ZGZjNjJlMTYiLCJ0IjoiYzlhMTZhYmMtNmMzOS00MWU1LWFjYzEtYWJiYThjNmE4ZGQ5IiwicyI6Im1tVnJpZVRGeGRQMnRmcndRcmR4Q2wxZDBDc3dXTXp1aUhUNENHZjdTcXIvYWloa3BndnJVRjUrSVI4RFdEZmZ0QlhSVUJGalZpTUNFREUwTmozQlVBPT0ifQ=="
$cfLog = Join-Path $runtimeDir "cf-tunnel.log"
if (Test-Path $cfExe) {
  Get-Process | Where-Object { $_.Name -like "cloudflared*" } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Start-Process -FilePath $cfExe -ArgumentList "tunnel --no-autoupdate run --token $cfToken" -WindowStyle Hidden -RedirectStandardError $cfLog
  Write-Log "Cloudflare tunnel started."
} else {
  Write-Log "cloudflared not found — public C2 will be unavailable."
}

$lastTokenRefresh = [DateTime]::MinValue

while ($true) {
  try {
    # Refresh Google Drive token every 55 minutes (tokens expire in 60m)
    if (([DateTime]::UtcNow - $lastTokenRefresh).TotalMinutes -ge 55) {
      Refresh-GoogleToken
      $lastTokenRefresh = [DateTime]::UtcNow
    }

    # Only kill node.exe processes on port 3000/3399 — never kill Docker or cloudflared
    $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 3000, 3399 }
    foreach ($listener in $listeners) {
      $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
      if ($proc -and $proc.Name -eq "node") {
        try {
          Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
          Write-Log "Stopped stale node listener on port $($listener.LocalPort) (pid $($listener.OwningProcess))."
        } catch {
          Write-Log "Failed to stop node on port $($listener.LocalPort): $($_.Exception.Message)"
        }
      }
    }

    Write-Log "Launching C2 backend on http://0.0.0.0:3000."
    & $nodeExe $entry *>> $logPath
    $exitCode = $LASTEXITCODE
    Write-Log "C2 backend exited with code $exitCode. Restarting in 2 seconds."
  } catch {
    Write-Log "Launcher error: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 2
}
