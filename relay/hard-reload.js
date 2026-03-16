const http = require('http');

function relay(psLines, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const script = psLines.join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const body = JSON.stringify({ encodedScript: encoded, timeoutMs: timeout });
    const req = http.request(
      { hostname: 'localhost', port: 3099, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); }
    );
    req.on('error', reject); req.write(body); req.end();
  });
}

async function main() {
  const r = await relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class WA {",
    "    [DllImport(\"user32.dll\")] public static extern void mouse_event(uint f, int x, int y, uint d, IntPtr e);",
    "    [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);",
    "}",
    "\"@",
    "# Click Chrome window to focus it",
    "[WA]::SetCursorPos(400, -700) | Out-Null",
    "Start-Sleep -Milliseconds 100",
    "[WA]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 50",
    "[WA]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 600",
    "# Hard reload",
    "[System.Windows.Forms.SendKeys]::SendWait('^+r')",
    "Start-Sleep -Milliseconds 2000",
    "Write-Output 'Hard reloaded'",
  ]);
  console.log(r.stdout, r.exitCode);
}
main().catch(console.error);
