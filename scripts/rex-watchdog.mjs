#!/usr/bin/env node
/**
 * Rex Infrastructure Watchdog
 * - Checks every connection directly
 * - Attempts auto-recovery per connection type
 * - Alerts operator ONLY if recovery fails (text + voice)
 * - Silently self-heals whenever possible
 */

import { execSync, exec } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { promisify } from 'util';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Config ────────────────────────────────────────────────────────
const CHECK_INTERVAL_MS   = 30_000;  // check every 30s
const FAILURE_THRESHOLD   = 2;       // failures before recovery attempt
const ALERT_THRESHOLD     = 4;       // failures before alerting operator
const RECOVERY_COOLDOWN_MS = 120_000; // 2 min between recovery attempts per monitor

// Load env
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV = loadEnv();

// ── Monitor definitions ───────────────────────────────────────────
const MONITORS = [
  // MCP Services
  { id: 'mcp-health',   name: 'MCP HTTP Health :3000',     type: 'http',      target: 'http://localhost:3000/health',   priority: 'P0', container: 'codex-mcp-server-mcp-server-1' },
  { id: 'mcp-ready',    name: 'MCP Ready :3000/ready',      type: 'http',      target: 'http://localhost:3000/ready',    priority: 'P0', container: 'codex-mcp-server-mcp-server-1' },
  { id: 'mcp-mirror',   name: 'MCP Mirror :4000',           type: 'http',      target: 'http://localhost:4000/health',   priority: 'P1', container: 'codex-mcp-server-mcp-server-1' },
  // n8n
  { id: 'n8n-health',   name: 'n8n Healthz :3001',          type: 'http',      target: 'http://localhost:3001/healthz',  priority: 'P0', container: 'n8n' },
  // Command Center
  { id: 'kuma',         name: 'Uptime Kuma :3011',          type: 'http',      target: 'http://localhost:3011/',         priority: 'P0', container: 'task-project-monitor' },
  { id: 'openclaw-gw',  name: 'OpenClaw Gateway :61299',    type: 'http',      target: 'http://187.77.211.125:61299/health', priority: 'P1', container: null },
  // Docker containers
  { id: 'docker-mcp',   name: 'Container: mcp-server',      type: 'docker',    target: 'codex-mcp-server-mcp-server-1', priority: 'P0', container: 'codex-mcp-server-mcp-server-1' },
  { id: 'docker-kuma',  name: 'Container: uptime-kuma',     type: 'docker',    target: 'task-project-monitor',          priority: 'P0', container: 'task-project-monitor' },
  { id: 'docker-n8n',   name: 'Container: n8n',             type: 'docker',    target: 'n8n',                           priority: 'P1', container: 'n8n' },
  { id: 'docker-cf',    name: 'Container: cloudflared',     type: 'docker',    target: 'task-cloudflared',              priority: 'P2', container: 'task-cloudflared' },
  { id: 'docker-pgn8n', name: 'Container: n8n-postgres',   type: 'docker',    target: 'n8n-stack-postgres-1',          priority: 'P2', container: 'n8n-stack-postgres-1' },
  // TCP ports
  { id: 'tcp-mcp',      name: 'TCP :3000 (MCP)',            type: 'tcp',       target: { host: 'localhost', port: 3000 }, priority: 'P1', container: 'codex-mcp-server-mcp-server-1' },
  { id: 'tcp-n8n',      name: 'TCP :3001 (n8n)',            type: 'tcp',       target: { host: 'localhost', port: 3001 }, priority: 'P1', container: 'n8n' },
  // Heartbeats — monitored by daemon separately, just check daemon is alive
  { id: 'hb-daemon',    name: 'Heartbeat Daemon',           type: 'process',   target: 'heartbeat-daemon',              priority: 'P0', container: null },
];

// ── State ─────────────────────────────────────────────────────────
const state = {};
for (const m of MONITORS) {
  state[m.id] = { failures: 0, lastRecovery: 0, alerted: false, lastStatus: null };
}

// ── Utilities ─────────────────────────────────────────────────────
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function log(level, msg) {
  const prefix = level === 'OK' ? '✓' : level === 'WARN' ? '⚠' : level === 'ERR' ? '✗' : level === 'FIX' ? '⟳' : '·';
  console.log(`[${ts()}] ${prefix}  ${msg}`);
}

// ── Health Checks ─────────────────────────────────────────────────
async function checkHttp(url, timeoutMs = 8000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function checkTcp(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; sock.destroy(); resolve({ ok }); } };
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => finish(true));
    sock.on('error',   () => finish(false));
    sock.on('timeout', () => finish(false));
    sock.connect(port, host);
  });
}

async function checkDocker(containerName) {
  try {
    const { stdout } = await execAsync(`docker inspect --format="{{.State.Status}}" ${containerName} 2>&1`);
    const status = stdout.trim().replace(/"/g, '');
    return { ok: status === 'running', status };
  } catch {
    return { ok: false, status: 'not-found' };
  }
}

async function checkProcess(nameFragment) {
  try {
    // Write a temp script to avoid escaping issues
    const { writeFileSync } = await import('fs');
    const tmpScript = path.join(ROOT, 'monitoring', '.check-proc.ps1');
    writeFileSync(tmpScript, `(Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object CommandLine -like "*${nameFragment}*" | Measure-Object).Count`);
    const { stdout } = await execAsync(`powershell -ExecutionPolicy Bypass -File "${tmpScript}"`);
    const count = parseInt(stdout.trim(), 10);
    return { ok: count > 0 };
  } catch {
    return { ok: false };
  }
}

async function runCheck(monitor) {
  switch (monitor.type) {
    case 'http':    return checkHttp(monitor.target);
    case 'tcp':     return checkTcp(monitor.target.host, monitor.target.port);
    case 'docker':  return checkDocker(monitor.target);
    case 'process': return checkProcess(monitor.target);
    default:        return { ok: false, error: 'unknown type' };
  }
}

// ── Auto Recovery ─────────────────────────────────────────────────
async function attemptRecovery(monitor) {
  const s = state[monitor.id];
  const now = Date.now();
  if (now - s.lastRecovery < RECOVERY_COOLDOWN_MS) return false; // too soon
  s.lastRecovery = now;

  log('FIX', `Attempting recovery: ${monitor.name}`);

  try {
    if (monitor.type === 'docker' || monitor.container) {
      const container = monitor.type === 'docker' ? monitor.target : monitor.container;
      if (container) {
        // Special ordering: if n8n, restart postgres first
        if (container === 'n8n') {
          await execAsync('docker restart n8n-stack-postgres-1').catch(() => {});
          await new Promise(r => setTimeout(r, 5000));
        }
        await execAsync(`docker restart ${container}`);
        await new Promise(r => setTimeout(r, 8000));
        const check = await runCheck(monitor);
        if (check.ok) {
          log('OK', `Recovered: ${monitor.name}`);
          return true;
        }
      }
    }

    if (monitor.type === 'process' && monitor.target === 'heartbeat-daemon') {
      // Restart heartbeat daemon
      const daemonPath = path.join(ROOT, 'scripts', 'heartbeat', 'heartbeat-daemon.mjs');
      exec(`node "${daemonPath}"`, { detached: true, stdio: 'ignore' }).unref();
      await new Promise(r => setTimeout(r, 3000));
      const check = await runCheck(monitor);
      if (check.ok) {
        log('OK', `Recovered heartbeat daemon`);
        return true;
      }
    }

    if (monitor.type === 'http' && monitor.container) {
      await execAsync(`docker restart ${monitor.container}`).catch(() => {});
      await new Promise(r => setTimeout(r, 10000));
      const check = await runCheck(monitor);
      if (check.ok) {
        log('OK', `Recovered via container restart: ${monitor.name}`);
        return true;
      }
    }
  } catch (e) {
    log('ERR', `Recovery failed for ${monitor.name}: ${e.message}`);
  }

  return false;
}

// ── Alert System ──────────────────────────────────────────────────
function buildAlertMessage(monitor) {
  const typeMap = {
    http: 'HTTP', tcp: 'TCP', docker: 'Docker Container',
    heartbeat: 'Heartbeat Push', process: 'Background Process', ping: 'Ping'
  };
  const typeLabel = typeMap[monitor.type] || monitor.type.toUpperCase();
  const reconnectMap = {
    'docker': `Restart container: docker restart ${monitor.container || monitor.target}`,
    'http':   monitor.container ? `Restart container: docker restart ${monitor.container}` : `Check service at ${monitor.target}`,
    'tcp':    monitor.container ? `Restart: docker restart ${monitor.container}` : `Check process on port ${monitor.target?.port}`,
    'process': `Start: node scripts/heartbeat/heartbeat-daemon.mjs`,
  };
  return {
    name: monitor.name,
    type: typeLabel,
    action: reconnectMap[monitor.type] || 'Manual investigation required',
    priority: monitor.priority,
  };
}

async function sendTelegramAlert(msg) {
  const token = ENV.REX_TELEGRAM_BOT_TOKEN || ENV.TELEGRAM_BOT_TOKEN;
  const chatId = ENV.OPERATOR_TELEGRAM_CHAT_ID || ENV.TELEGRAM_OPERATOR_CHAT_ID;

  if (!token || token.includes('your_') || !chatId) {
    log('WARN', `Telegram not configured — alert skipped. Set REX_TELEGRAM_BOT_TOKEN + OPERATOR_TELEGRAM_CHAT_ID in .env`);
    return false;
  }

  const text = `⚠️ CONNECTION LOST\n${msg.name} | ${msg.type} | ${msg.priority}\n${msg.action}`;

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const body = await r.json();
    if (body.ok) { log('OK', `Telegram alert sent: ${msg.name}`); return true; }
    log('ERR', `Telegram failed: ${JSON.stringify(body)}`);
    return false;
  } catch (e) {
    log('ERR', `Telegram error: ${e.message}`);
    return false;
  }
}

async function sendVoiceAlert(msg) {
  const apiKey = ENV.Elevenlabs_API_Key || ENV.ELEVENLABS_API_KEY;
  const voiceId = ENV.ELEVENLABS_VOICE_ID_REX || '21m00Tcm4TlvDq8ikWAM'; // default Rex voice

  if (!apiKey || apiKey.includes('your_')) {
    log('WARN', 'ElevenLabs not configured — voice alert skipped');
    return false;
  }

  const script = `Rex alert. Connection lost: ${msg.name}. Type: ${msg.type}. Priority: ${msg.priority}. Action required: ${msg.action}.`;

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!r.ok) {
      log('ERR', `ElevenLabs error: ${r.status}`);
      return false;
    }

    const audioBuffer = Buffer.from(await r.arrayBuffer());
    const audioFile = path.join(ROOT, 'monitoring', '.rex-alert-temp.mp3');

    // Write audio to temp file and play via Windows media player
    const { writeFileSync } = await import('fs');
    writeFileSync(audioFile, audioBuffer);

    // Play audio (Windows)
    exec(`powershell -Command "(New-Object Media.SoundPlayer).PlaySync()" 2>nul || powershell -Command "Add-Type -AssemblyName presentationCore; \$player = New-Object System.Windows.Media.MediaPlayer; \$player.Open([uri]'${audioFile}'); \$player.Play(); Start-Sleep 8"`, { timeout: 15000 }).unref();

    log('OK', `Voice alert played: ${msg.name}`);
    return true;
  } catch (e) {
    log('ERR', `Voice alert error: ${e.message}`);
    return false;
  }
}

async function alert(monitor) {
  const s = state[monitor.id];
  if (s.alerted) return; // already alerted for this incident
  s.alerted = true;

  const msg = buildAlertMessage(monitor);

  log('ERR', `ALERTING OPERATOR — ${monitor.name} unrecoverable (${state[monitor.id].failures} failures)`);

  // Send text first (fast), then voice
  await sendTelegramAlert(msg);
  await sendVoiceAlert(msg);
}

// ── Main Loop ─────────────────────────────────────────────────────
async function checkAll() {
  for (const monitor of MONITORS) {
    const s = state[monitor.id];

    try {
      const result = await runCheck(monitor);

      if (result.ok) {
        // Recovered
        if (s.failures > 0) {
          log('OK', `Restored: ${monitor.name} (was ${s.failures} failures)`);
        }
        s.failures  = 0;
        s.alerted   = false;
        s.lastStatus = 'up';
      } else {
        s.failures++;
        s.lastStatus = 'down';

        if (s.failures === 1) {
          log('WARN', `Check failed: ${monitor.name} (attempt 1)`);
        } else if (s.failures === FAILURE_THRESHOLD) {
          log('WARN', `${monitor.name} failing ${s.failures}x — attempting recovery`);
          const recovered = await attemptRecovery(monitor);
          if (recovered) {
            s.failures = 0;
            s.alerted  = false;
          }
        } else if (s.failures >= ALERT_THRESHOLD && !s.alerted) {
          // Recovery didn't work — alert operator
          await alert(monitor);
        } else if (s.failures > 1 && s.failures < FAILURE_THRESHOLD) {
          log('WARN', `${monitor.name} still failing (${s.failures}x)`);
        }
      }
    } catch (e) {
      log('ERR', `Check error for ${monitor.name}: ${e.message}`);
    }
  }
}

async function start() {
  log('·', `Rex Watchdog starting — ${MONITORS.length} monitors, ${CHECK_INTERVAL_MS / 1000}s interval`);

  // Initial check
  await checkAll();

  // Schedule
  setInterval(checkAll, CHECK_INTERVAL_MS);

  log('·', 'Watchdog running. Auto-recovery active. Operator alerts enabled.');
}

process.on('SIGINT',  () => { log('·', 'Watchdog stopped.'); process.exit(0); });
process.on('SIGTERM', () => { log('·', 'Watchdog stopped.'); process.exit(0); });
process.on('uncaughtException', (e) => log('ERR', `Uncaught: ${e.message}`));

start();
