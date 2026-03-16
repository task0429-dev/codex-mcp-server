const http = require('http');

function relay(psLines, timeout = 15000) {
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
  // Click on the Chrome window content area to focus it, then hard reload
  const r = await relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class WinAPI {",
    "    [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);",
    "    [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);",
    "    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
    "}",
    "\"@",
    "",
    "# Click on Chrome content area (left side, middle area of voice page)",
    "[WinAPI]::SetCursorPos(300, -700) | Out-Null",
    "Start-Sleep -Milliseconds 100",
    "[WinAPI]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 50",
    "[WinAPI]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 500",
    "$fg = [WinAPI]::GetForegroundWindow()",
    "Write-Output \"Focused hwnd: $fg\"",
    "",
    "# Hard reload with Ctrl+Shift+R",
    "[System.Windows.Forms.SendKeys]::SendWait('^+r')",
    "Start-Sleep -Milliseconds 2000",
    "Write-Output 'Hard reload sent'",
  ]);
  console.log(r.stdout, r.exitCode);
}

main().catch(console.error);
