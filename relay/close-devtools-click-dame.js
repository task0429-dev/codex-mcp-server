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
  const r = await relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class WinAPI {",
    "    [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "    [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);",
    "    [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);",
    "}",
    "\"@",
    "",
    "$chrome = Get-Process -Name 'chrome' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1",
    "if (-not $chrome) { Write-Output 'Chrome not found'; exit }",
    "[WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null",
    "Start-Sleep -Milliseconds 500",
    "",
    "# Close DevTools if open",
    "[System.Windows.Forms.SendKeys]::SendWait('{F12}')",
    "Start-Sleep -Milliseconds 800",
    "",
    "# Click Dame card - secondary monitor at 5,-1080",
    "# Chrome is left half, dame is 3rd card row 1 ~x=570 y=-790",
    "[WinAPI]::SetCursorPos(570, -790) | Out-Null",
    "Start-Sleep -Milliseconds 200",
    "[WinAPI]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 50",
    "[WinAPI]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 500",
    "",
    "# Press S to start listening",
    "[System.Windows.Forms.SendKeys]::SendWait('s')",
    "Start-Sleep -Milliseconds 3000",
    "",
    "# Press S again to stop and send",
    "[System.Windows.Forms.SendKeys]::SendWait('s')",
    "Write-Output 'Done - sent to agent'",
  ]);
  console.log(r.stdout, r.stderr ? r.stderr.slice(0, 200) : '');
}

main().catch(console.error);
