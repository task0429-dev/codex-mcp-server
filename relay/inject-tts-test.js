const script = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class WinHelper {',
  '    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
  '}',
  '"@',
  '',
  '$chrome = Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1',
  'if ($chrome) {',
  '    [WinHelper]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null',
  '    Start-Sleep -Milliseconds 600',
  '    [System.Windows.Forms.SendKeys]::SendWait("{F12}")',
  '    Start-Sleep -Milliseconds 1500',
  '    [System.Windows.Forms.SendKeys]::SendWait("^`")',
  '    Start-Sleep -Milliseconds 1000',
  '    $js = "var u=new SpeechSynthesisUtterance(\'Dame test voice\');u.pitch=0.75;u.rate=0.9;speechSynthesis.speak(u);"',
  '    [System.Windows.Forms.SendKeys]::SendWait($js)',
  '    Start-Sleep -Milliseconds 300',
  '    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")',
  '    Write-Output "Injected"',
  '} else {',
  '    Write-Output "Chrome not found"',
  '}',
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
