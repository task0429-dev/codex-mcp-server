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

function screenshot() {
  return relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$screens = [System.Windows.Forms.Screen]::AllScreens",
    "$secondary = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1",
    "if (-not $secondary) { $secondary = $screens[0] }",
    "$b = $secondary.Bounds",
    "$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)",
    "$g = [System.Drawing.Graphics]::FromImage($bmp)",
    "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)",
    "$bmp.Save('C:\\Users\\offic\\AppData\\Local\\Temp\\screen_voice.png')",
    "$g.Dispose(); $bmp.Dispose()",
    "Write-Output 'screenshot'",
  ]);
}

async function main() {
  // Open DevTools on Chrome
  const r = await relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class WinAPI {",
    "    [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
    "}",
    "\"@",
    "",
    "$chrome = Get-Process -Name 'chrome' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1",
    "if (-not $chrome) { Write-Output 'Chrome not found'; exit }",
    "Write-Output \"Focusing Chrome: $($chrome.MainWindowTitle)\"",
    "[WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null",
    "Start-Sleep -Milliseconds 1000",
    "$fg = [WinAPI]::GetForegroundWindow()",
    "Write-Output \"Foreground hwnd: $fg  Chrome hwnd: $($chrome.MainWindowHandle)\"",
    "[System.Windows.Forms.SendKeys]::SendWait('^+j')",
    "Start-Sleep -Milliseconds 2500",
    "Write-Output 'DevTools open command sent'",
  ]);
  console.log('Open DevTools:', r.stdout);

  // Screenshot to see if DevTools opened
  await screenshot();
  console.log('Screenshot taken - check screen_voice.png');
}

main().catch(console.error);
