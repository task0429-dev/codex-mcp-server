/**
 * PM2 Ecosystem Config — Task Enterprise LLC
 * Manages: MCP HTTP server + Cortex daemon (24/7 memory capture)
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs          # start all
 *   pm2 start ecosystem.config.cjs --only cortex-daemon
 *   pm2 logs cortex-daemon
 *   pm2 save && pm2 startup                 # persist across reboots
 */

module.exports = {
  apps: [
    // ── MCP HTTP Server ───────────────────────────────────────────────────
    {
      name: "codex-mcp-http",
      script: "dist/index-http.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "data/logs/pm2-mcp-error.log",
      out_file: "data/logs/pm2-mcp-out.log",
    },

    // ── Cortex Daemon (24/7 memory ingestion) ─────────────────────────────
    {
      name: "cortex-daemon",
      script: "scripts/cortex-daemon.mjs",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      restart_delay: 5000,
      // Restart at most 10 times in 30 seconds — prevents crash loops
      max_restarts: 10,
      min_uptime: "5s",
      env: {
        NODE_ENV: "production",
        CORTEX_DAEMON_PORT: "7710",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "data/logs/cortex-daemon-error.log",
      out_file: "data/logs/cortex-daemon-out.log",
    },
  ],
};
