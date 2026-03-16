// Open Chrome DevTools console and test speechSynthesis
// Using simple command to avoid special character escaping issues
const script = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class WinAPI {',
  '    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
  '}',
  '"@',
  '',
  '$chrome = Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1',
  'if (-not $chrome) { Write-Output "Chrome not found"; exit }',
  '',
  '[WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null',
  'Start-Sleep -Milliseconds 600',
  '',
  '# Open DevTools with F12',
  '[System.Windows.Forms.SendKeys]::SendWait("{F12}")',
  'Start-Sleep -Milliseconds 2000',
  '',
  '# Switch to Console tab with Ctrl+Shift+J (opens console directly)',
  '[System.Windows.Forms.SendKeys]::SendWait("^+j")',
  'Start-Sleep -Milliseconds 1000',
  '',
  '# Type simple speechSynthesis test - avoid special chars',
  '# speechSynthesis.speak(new SpeechSynthesisUtterance("Hello from Dame"))',
  '[System.Windows.Forms.SendKeys]::SendWait("speechSynthesis.speak{(}new SpeechSynthesisUtterance{(}\"Hello from Dame\"{)}{)}")',
  'Start-Sleep -Milliseconds 300',
  '[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")',
  'Start-Sleep -Milliseconds 500',
  'Write-Output "Console command sent"',
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
