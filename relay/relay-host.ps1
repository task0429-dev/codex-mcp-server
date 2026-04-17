param(
  [int]$Port = 3099
)

$ErrorActionPreference = "Stop"

function ConvertTo-JsonBytes {
  param([Parameter(Mandatory = $true)]$Body)
  $json = $Body | ConvertTo-Json -Depth 8 -Compress
  return [System.Text.Encoding]::UTF8.GetBytes($json)
}

function Send-HttpResponse {
  param(
    [Parameter(Mandatory = $true)]$Stream,
    [Parameter(Mandatory = $true)][int]$StatusCode,
    [Parameter(Mandatory = $true)]$Body,
    [string]$StatusText = "OK"
  )

  $bytes = ConvertTo-JsonBytes -Body $Body
  $headerText = @(
    "HTTP/1.1 $StatusCode $StatusText"
    "Content-Type: application/json; charset=utf-8"
    "Access-Control-Allow-Origin: *"
    "Connection: close"
    "Content-Length: $($bytes.Length)"
    ""
    ""
  ) -join "`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerText)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($bytes, 0, $bytes.Length)
  $Stream.Flush()
}

function Invoke-EncodedScript {
  param(
    [Parameter(Mandatory = $true)][string]$EncodedScript,
    [int]$TimeoutMs = 30000
  )

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "powershell.exe"
  $psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -STA -EncodedCommand $EncodedScript"
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  $null = $process.Start()

  if (-not $process.WaitForExit($TimeoutMs)) {
    try { $process.Kill() } catch {}
    return @{
      stdout = $process.StandardOutput.ReadToEnd().Trim()
      stderr = $process.StandardError.ReadToEnd().Trim()
      exitCode = -1
      timedOut = $true
    }
  }

  return @{
    stdout = $process.StandardOutput.ReadToEnd().Trim()
    stderr = $process.StandardError.ReadToEnd().Trim()
    exitCode = $process.ExitCode
    timedOut = $false
  }
}

function Read-HttpRequest {
  param([Parameter(Mandatory = $true)]$Stream)

  $reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)
  $requestLine = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($requestLine)) {
    return $null
  }

  $parts = $requestLine.Split(" ")
  $headers = @{}
  while ($true) {
    $line = $reader.ReadLine()
    if ($null -eq $line -or $line -eq "") {
      break
    }
    $idx = $line.IndexOf(":")
    if ($idx -gt 0) {
      $name = $line.Substring(0, $idx).Trim().ToLowerInvariant()
      $value = $line.Substring($idx + 1).Trim()
      $headers[$name] = $value
    }
  }

  $body = ""
  if ($headers.ContainsKey("content-length")) {
    $length = [int]$headers["content-length"]
    if ($length -gt 0) {
      $buffer = New-Object char[] $length
      $offset = 0
      while ($offset -lt $length) {
        $read = $reader.Read($buffer, $offset, $length - $offset)
        if ($read -le 0) { break }
        $offset += $read
      }
      $body = New-Object string($buffer, 0, $offset)
    }
  }

  return @{
    Method = $parts[0]
    Path = $parts[1]
    Headers = $headers
    Body = $body
  }
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()
Write-Host "[Host Relay] Listening on port $Port (native PowerShell TCP relay)"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $request = Read-HttpRequest -Stream $stream
      if ($null -eq $request) {
        continue
      }

      if ($request.Method -eq "OPTIONS") {
        $headerText = @(
          "HTTP/1.1 204 No Content"
          "Access-Control-Allow-Origin: *"
          "Access-Control-Allow-Methods: GET,POST,OPTIONS"
          "Access-Control-Allow-Headers: Content-Type"
          "Connection: close"
          "Content-Length: 0"
          ""
          ""
        ) -join "`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerText)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Flush()
        continue
      }

      if ($request.Method -eq "GET" -and $request.Path -eq "/health") {
        Send-HttpResponse -Stream $stream -StatusCode 200 -Body @{
          ok = $true
          platform = "win32"
          relay = "powershell-tcp"
          port = $Port
        }
        continue
      }

      if ($request.Method -eq "POST" -and $request.Path -eq "/execute") {
        try {
          $parsed = if ([string]::IsNullOrWhiteSpace($request.Body)) { @{} } else { $request.Body | ConvertFrom-Json }
          $encodedScript = [string]$parsed.encodedScript
          $timeoutMs = if ($parsed.timeoutMs) { [int]$parsed.timeoutMs } else { 30000 }
          if ([string]::IsNullOrWhiteSpace($encodedScript)) {
            Send-HttpResponse -Stream $stream -StatusCode 400 -StatusText "Bad Request" -Body @{ error = "Missing encodedScript" }
            continue
          }
          $result = Invoke-EncodedScript -EncodedScript $encodedScript -TimeoutMs $timeoutMs
          Send-HttpResponse -Stream $stream -StatusCode 200 -Body $result
        } catch {
          Send-HttpResponse -Stream $stream -StatusCode 500 -StatusText "Internal Server Error" -Body @{ error = $_.Exception.Message }
        }
        continue
      }

      Send-HttpResponse -Stream $stream -StatusCode 404 -StatusText "Not Found" -Body @{ error = "Not found" }
    } finally {
      if ($stream) { $stream.Dispose() }
      $client.Dispose()
    }
  }
} finally {
  $listener.Stop()
}
