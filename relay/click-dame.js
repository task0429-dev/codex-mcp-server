// Focus Chrome and click on the Dame agent card on the Voice page
const script = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class WinAPI {',
  '    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
  '    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);',
  '    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);',
  '}',
  '"@',
  '',
  '$chrome = Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1',
  'if (-not $chrome) { Write-Output "Chrome not found"; exit }',
  '',
  '[WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null',
  'Start-Sleep -Milliseconds 800',
  '',
  '# Click on Dame card (3rd card in row 1 of voice grid)',
  '# Secondary monitor: x=5 to x=1924, y=-1080 to y=0',
  '# Chrome appears on left ~half of screen. Dame card approx x=570, y=-790 (absolute coords)',
  '# Adjust to absolute screen coordinates (secondary monitor starts at y=-1080)',
  '$clickX = 570',
  '$clickY = -790',
  '[WinAPI]::SetCursorPos($clickX, $clickY) | Out-Null',
  'Start-Sleep -Milliseconds 200',
  '[WinAPI]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)',
  'Start-Sleep -Milliseconds 50',
  '[WinAPI]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)',
  'Start-Sleep -Milliseconds 500',
  'Write-Output "Clicked Dame card at $clickX, $clickY"',
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
