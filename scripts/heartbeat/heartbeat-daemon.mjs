#!/usr/bin/env node
/**
 * Rex Heartbeat Keepalive Daemon
 * Pings all Uptime Kuma heartbeat monitors on schedule.
 * Run: node scripts/heartbeat/heartbeat-daemon.mjs
 */

const MONITORS = [
  {
    name: 'Rex Agent Loop',
    url:  'http://localhost:3011/api/push/heartbeat-rex-agent-loop-d7id54',
    intervalMs: 45_000,   // expected 60s — ping every 45s to stay well inside window
  },
  {
    name: 'Project2 Strike Run',
    url:  'http://localhost:3011/api/push/heartbeat-project2-strike-run-84n1ay',
    intervalMs: 30 * 60_000,  // expected 1h — ping every 30 min
  },
  {
    name: 'Project2 Launch Verify',
    url:  'http://localhost:3011/api/push/heartbeat-project2-launch-verify-l467j7',
    intervalMs: 3 * 60 * 60_000, // expected 6h — ping every 3h
  },
  {
    name: 'Project2 Notion Replay',
    url:  'http://localhost:3011/api/push/heartbeat-project2-notion-replay-kc3yv',
    intervalMs: 3 * 60 * 60_000, // expected 6h — ping every 3h
  },
  {
    name: 'Nightly Backup Job',
    url:  'http://localhost:3011/api/push/heartbeat-nightly-backup-job-m3m56w',
    intervalMs: 12 * 60 * 60_000, // expected 24h — ping every 12h
  },
];

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function ping(monitor) {
  const url = `${monitor.url}?status=up&msg=keepalive`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    if (r.ok) {
      console.log(`[${ts()}] ✓  ${monitor.name}`);
    } else {
      console.error(`[${ts()}] ✗  ${monitor.name} — HTTP ${r.status}: ${body.slice(0, 80)}`);
    }
  } catch (err) {
    console.error(`[${ts()}] ✗  ${monitor.name} — ${err.message}`);
  }
}

async function start() {
  console.log(`[${ts()}] Rex Heartbeat Daemon starting — ${MONITORS.length} monitors`);

  // Ping everything immediately on startup
  await Promise.all(MONITORS.map(ping));

  // Schedule each monitor independently
  for (const monitor of MONITORS) {
    setInterval(() => ping(monitor), monitor.intervalMs);
  }

  console.log(`[${ts()}] All monitors scheduled. Running…`);
}

// Keep process alive
process.on('SIGINT',  () => { console.log('\nDaemon stopped.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nDaemon stopped.'); process.exit(0); });

start().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
