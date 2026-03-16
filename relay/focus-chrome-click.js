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

function screenshot(name = 'screen_voice.png') {
  return relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$screens = [System.Windows.Forms.Screen]::AllScreens",
    "$s = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1",
    "if (-not $s) { $s = $screens[0] }",
    "$b = $s.Bounds",
    "$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)",
    "$g = [System.Drawing.Graphics]::FromImage($bmp)",
    "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)",
    `$bmp.Save('C:\\Users\\offic\\AppData\\Local\\Temp\\${name}')`,
    "$g.Dispose(); $bmp.Dispose()",
    "Write-Output 'ok'",
  ]);
}

async function main() {
  // Click on Chrome window to bring it to focus
  // Chrome is on LEFT half of secondary monitor (x=5 to ~960, y=-1080 to 0)
  // Click in the middle of the Voice page content area
  let r = await relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class WinAPI {",
    "    [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);",
    "    [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);",
    "    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
    "    [DllImport(\"user32.dll\")] public static extern IntPtr WindowFromPoint(System.Drawing.Point p);",
    "}",
    "\"@",
    "",
    "# Click on Chrome window (left half of secondary monitor, in the Voice content area)",
    "$clickX = 400",
    "$clickY = -700",
    "[WinAPI]::SetCursorPos($clickX, $clickY) | Out-Null",
    "Start-Sleep -Milliseconds 100",
    "[WinAPI]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 50",
    "[WinAPI]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 800",
    "$fg = [WinAPI]::GetForegroundWindow()",
    "Write-Output \"After click, fg hwnd: $fg\"",
    "",
    "# Now send Ctrl+Shift+J to open DevTools console",
    "[System.Windows.Forms.SendKeys]::SendWait('^+j')",
    "Start-Sleep -Milliseconds 2500",
    "Write-Output 'DevTools open command sent to focused window'",
  ]);
  console.log('Focus+DevTools:', r.stdout);

  // Screenshot to see result
  await screenshot('devtools_check.png');
  console.log('Screenshot saved as devtools_check.png');

  // Now type the TTS command
  r = await relay([
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class WinAPI {",
    "    [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);",
    "    [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);",
    "}",
    "\"@",
    "",
    "# Click somewhere at bottom of Chrome window to focus console input",
    "# DevTools opens at bottom - click around y=-100 to -200 (bottom area of Chrome)",
    "[WinAPI]::SetCursorPos(400, -150) | Out-Null",
    "Start-Sleep -Milliseconds 100",
    "[WinAPI]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 50",
    "[WinAPI]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero)",
    "Start-Sleep -Milliseconds 500",
    "",
    "# Type TTS command using single quotes",
    "$cmd = 'speechSynthesis.speak{(}new SpeechSynthesisUtterance{(}' + [char]39 + 'Hello, this is Dame. The voice system is working.' + [char]39 + '{)}{)}'",
    "[System.Windows.Forms.SendKeys]::SendWait($cmd)",
    "Start-Sleep -Milliseconds 300",
    "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')",
    "Start-Sleep -Milliseconds 500",
    "Write-Output 'TTS command typed'",
  ]);
  console.log('TTS command:', r.stdout);
}

main().catch(console.error);
