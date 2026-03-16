// Restart the relay process so it picks up the new /tts endpoint
const http = require('http');
const { spawn } = require('child_process');

// Kill existing relay on port 3099
const kill = require('child_process').execSync;
try {
  kill('powershell -Command "Get-NetTCPConnection -LocalPort 3099 -State Listen | ForEach-Object { Stop-Process -Id (Get-Process -Id $_.OwningProcess).Id -Force }"', { stdio: 'pipe' });
  console.log('Killed old relay');
} catch(e) {
  console.log('No existing relay to kill (or already stopped)');
}

setTimeout(() => {
  // Start new relay
  const child = spawn('node', ['relay/relay.js'], {
    cwd: 'C:\\Users\\offic\\Documents\\Codex\\mcp-server',
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  console.log('New relay started with PID', child.pid);
}, 1000);
