// Navigate Chrome address bar to a javascript: URL to test speechSynthesis
// This bypasses the need for DevTools console
const jsCmd = "javascript:void(fetch('/api/voice/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentId:'dame',message:'Say hello in one short sentence'})}).then(r=>r.json()).then(d=>{var u=new SpeechSynthesisUtterance(d.reply||'Hello');u.pitch=0.75;u.rate=0.9;speechSynthesis.speak(u);alert('Speaking: '+d.reply);}))";

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
  'Start-Sleep -Milliseconds 500',
  '',
  '# Press Ctrl+L to focus address bar',
  '[System.Windows.Forms.SendKeys]::SendWait("^l")',
  'Start-Sleep -Milliseconds 600',
  '',
  '# Type the javascript: URL',
  `[System.Windows.Forms.SendKeys]::SendWait("${jsCmd.replace(/[+^%~(){}\[\]]/g, '{$&}')}")`,
  'Start-Sleep -Milliseconds 300',
  '[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")',
  'Write-Output "Injected voice test via address bar"',
].join('\n');

const encoded = Buffer.from(script, 'utf16le').toString('base64');
const body = JSON.stringify({ encodedScript: encoded, timeoutMs: 15000 });
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
