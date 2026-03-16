const http = require('http');

// Check OneCore voices (Windows 11 neural voices are in a different registry path)
const script = [
  "# Check OneCore / Neural voices",
  "Write-Output '=== OneCore Voices ==='",
  "Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens' -ErrorAction SilentlyContinue | ForEach-Object { $_.GetValue('') }",
  "",
  "Write-Output '=== Desktop Voices ==='",
  "Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens' -ErrorAction SilentlyContinue | ForEach-Object { $_.GetValue('') }",
  "",
  "Write-Output '=== WinRT voices ==='",
  "try {",
  "  Add-Type -AssemblyName System.Runtime",
  "  $t = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.Speech,ContentType=WindowsRuntime]",
  "  $synth = $t::new()",
  "  $synth.AllVoices | ForEach-Object { \"$($_.DisplayName) | $($_.Gender)\" }",
  "  $synth.Dispose()",
  "} catch { Write-Output \"WinRT error: $_\" }",
].join('\n');

const encoded = Buffer.from(script, 'utf16le').toString('base64');
const body = JSON.stringify({ encodedScript: encoded, timeoutMs: 15000 });
const req = http.request(
  { hostname: 'localhost', port: 3099, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
  (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { const r = JSON.parse(d); console.log(r.stdout || r.stderr); }); }
);
req.write(body); req.end();
