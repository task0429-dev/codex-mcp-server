// Open Chrome DevTools console and test speechSynthesis
// Use single-quoted PS strings to avoid double-quote escaping issues
const script = [
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
  "",
  "[WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null",
  "Start-Sleep -Milliseconds 600",
  "",
  "# Open Console with Ctrl+Shift+J",
  "[System.Windows.Forms.SendKeys]::SendWait('^+j')",
  "Start-Sleep -Milliseconds 2000",
  "",
  "# Type JS command using single-quoted PS string, concat quote chars",
  "$q = [char]34",
  "$cmd = 'speechSynthesis.speak{(}new SpeechSynthesisUtterance{(}' + $q + 'Hello from Dame' + $q + '{)}{)}'",
  "[System.Windows.Forms.SendKeys]::SendWait($cmd)",
  "Start-Sleep -Milliseconds 300",
  "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')",
  "Start-Sleep -Milliseconds 500",
  "Write-Output 'Console command sent'",
].join('\n');

const encoded = Buffer.from(script, 'utf16le').toString('base64');
const body = JSON.stringify({ encodedScript: encoded, timeoutMs: 20000 });
const http = require('http');
const req = http.request(
  { hostname: 'localhost', port: 3099, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
  (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => console.log(d));
  }
);
req.write(body);
req.end();
