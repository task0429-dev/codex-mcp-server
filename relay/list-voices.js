const http = require('http');

const script = [
  "Add-Type -AssemblyName System.Speech",
  "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
  "$voices = $synth.GetInstalledVoices()",
  "foreach ($v in $voices) {",
  "    $info = $v.VoiceInfo",
  "    Write-Output \"$($info.Name) | $($info.Gender) | $($info.Culture)\"",
  "}",
  "$synth.Dispose()",
].join('\n');

const encoded = Buffer.from(script, 'utf16le').toString('base64');
const body = JSON.stringify({ encodedScript: encoded, timeoutMs: 15000 });
const req = http.request(
  { hostname: 'localhost', port: 3099, path: '/execute', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
  (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { const r = JSON.parse(d); console.log('VOICES:\n' + r.stdout); }); }
);
req.write(body); req.end();
