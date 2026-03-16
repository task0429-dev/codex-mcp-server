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

function screenshot() {
  return relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$s = ([System.Windows.Forms.Screen]::AllScreens | Where-Object { -not $_.Primary } | Select-Object -First 1)",
    "if (-not $s) { $s = [System.Windows.Forms.Screen]::PrimaryScreen }",
    "$b = $s.Bounds",
    "$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)",
    "$g = [System.Drawing.Graphics]::FromImage($bmp)",
    "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)",
    "$bmp.Save('C:\\Users\\offic\\AppData\\Local\\Temp\\screen_voice.png')",
    "$g.Dispose(); $bmp.Dispose()",
    "Write-Output 'ok'",
  ]);
}

async function main() {
  // The status bar with buttons is at the bottom of the Chrome content area
  // Chrome: x=5 to ~960, y=-1080 to 0 (secondary monitor)
  // Status bar roughly at y=-255 to -235 (near bottom of Chrome)
  // "Test Voice" button is to the RIGHT of "Speak (S)" button
  // Approximate: x=760, y=-245

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
    "",
    "# Click the Chrome window first to ensure focus",
    "[WA]::SetCursorPos(300, -600) | Out-Null",
    "Start-Sleep -Milliseconds 100",
    "[WA]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 50",
    "[WA]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 400",
    "",
    "# Click 'Test Voice' button — it's to the right of 'Speak (S)'",
    "# Status bar is near bottom of Chrome (~y=-245)",
    "[WA]::SetCursorPos(760, -245) | Out-Null",
    "Start-Sleep -Milliseconds 200",
    "[WA]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 50",
    "[WA]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 500",
    "Write-Output 'Clicked Test Voice'",
  ]);
  console.log(r.stdout);

  await new Promise(r => setTimeout(r, 3000));
  await screenshot();
  console.log('Screenshot taken');
}

main().catch(console.error);
