// Step 1: focus Chrome, navigate to voice page
// Step 2: open DevTools console
// Step 3: inject TTS test
const http = require('http');

function relay(psLines, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const script = psLines.join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const body = JSON.stringify({ encodedScript: encoded, timeoutMs: timeout });
    const req = http.request(
      { hostname: 'localhost', port: 3099, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(JSON.parse(d)));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Step 1: Find Chrome and navigate to /voice
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
    "$title = $chrome.MainWindowTitle",
    "Write-Output \"Found Chrome: $title\"",
    "[WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null",
    "Start-Sleep -Milliseconds 800",
    "",
    "# Navigate to voice page",
    "[System.Windows.Forms.SendKeys]::SendWait('^l')",
    "Start-Sleep -Milliseconds 500",
    "[System.Windows.Forms.SendKeys]::SendWait('http://localhost:3000/voice')",
    "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')",
    "Start-Sleep -Milliseconds 2000",
    "Write-Output 'Navigated to /voice'",
  ]);
  console.log('Step 1:', r.stdout);

  // Step 2: Open DevTools console and run TTS test
  r = await relay([
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
    "[WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null",
    "Start-Sleep -Milliseconds 500",
    "",
    "# Ctrl+Shift+J opens Console directly",
    "[System.Windows.Forms.SendKeys]::SendWait('^+j')",
    "Start-Sleep -Milliseconds 2000",
    "",
    "# Type TTS test command - no double quotes inside (use single quotes in JS)",
    "$q = [char]39",  // single quote char
    "$cmd = 'speechSynthesis.speak{(}new SpeechSynthesisUtterance{(}' + $q + 'Hello from Dame, your AI agent' + $q + '{)}{)}'",
    "[System.Windows.Forms.SendKeys]::SendWait($cmd)",
    "Start-Sleep -Milliseconds 200",
    "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')",
    "Start-Sleep -Milliseconds 1000",
    "Write-Output 'TTS command typed in console'",
  ]);
  console.log('Step 2:', r.stdout, r.stderr ? r.stderr.slice(0, 100) : '');
}

main().catch(console.error);
