const http = require('http');

function relay(psLines, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const script = psLines.join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const body = JSON.stringify({ encodedScript: encoded, timeoutMs: timeout });
    const req = http.request(
      { hostname: 'localhost', port: 3099, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); }
    );
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function main() {
  // Navigate to voice page first, clean state
  let r = await relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class WinAPI {",
    "    [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "}",
    "\"@",
    "",
    "$chrome = Get-Process -Name 'chrome' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1",
    "if (-not $chrome) { Write-Output 'Chrome not found'; exit }",
    "Write-Output \"Chrome: $($chrome.MainWindowTitle)\"",
    "[WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null",
    "Start-Sleep -Milliseconds 700",
    "",
    "# Focus address bar",
    "[System.Windows.Forms.SendKeys]::SendWait('^l')",
    "Start-Sleep -Milliseconds 500",
    "",
    "# Type javascript: URL with single-quoted string (no escaping needed)",
    "[System.Windows.Forms.SendKeys]::SendWait('javascript:speechSynthesis.speak{(}new SpeechSynthesisUtterance{(}' + [char]39 + 'Hello, this is Dame speaking. Voice test successful.' + [char]39 + '{)}{)}')",
    "Start-Sleep -Milliseconds 300",
    "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')",
    "Start-Sleep -Milliseconds 1000",
    "Write-Output 'TTS via address bar triggered'",
  ]);
  console.log('Result:', r.stdout, r.exitCode);
}

main().catch(console.error);
