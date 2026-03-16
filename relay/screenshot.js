const script = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '$screens = [System.Windows.Forms.Screen]::AllScreens',
  '$secondary = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1',
  'if (-not $secondary) { $secondary = $screens[0] }',
  '$b = $secondary.Bounds',
  'Write-Output "Monitor: $($b.X),$($b.Y) $($b.Width)x$($b.Height)"',
  '$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)',
  '$g = [System.Drawing.Graphics]::FromImage($bmp)',
  '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
  '$bmp.Save("C:\\Users\\offic\\AppData\\Local\\Temp\\screen_voice.png")',
  '$g.Dispose()',
  '$bmp.Dispose()',
  'Write-Output "Saved"',
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
