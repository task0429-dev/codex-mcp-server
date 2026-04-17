# Infrastructure Audit Summary (Rex Monitoring)

Audit timestamp: 2026-04-04 (America/Chicago)

## Active and reachable
- MCP HTTP health: `http://localhost:3000/health` (200)
- MCP mirror health: `http://localhost:4000/health` (200)
- Uptime Kuma dashboard: `http://localhost:3011/dashboard` (200)
- n8n UI: `http://localhost:3001/` (200)
- n8n health: `http://localhost:3001/healthz` (200)
- OpenClaw gateway candidate: `http://187.77.211.125:61299/health` (200)

## Running Docker containers
- `codex-mcp-server-mcp-server-1` (healthy)
- `task-project-monitor` (healthy)
- `n8n`
- `n8n-stack-postgres-1`
- `task-cloudflared`
- `task0429-db-1` (restart loop)

## Degraded/risky findings
- `task-cloudflared` tunnel behavior unstable per runtime history.
- `task0429-db-1` is in restart loop.
- Desktop relay probe `http://localhost:3099/health` is unreachable.

## Missing or not authoritative yet
- Confirmed production website/domain list for Task Enterprise.
- Confirmed cloudflared public hostname(s).
- Confirmed alert destination credentials/notification IDs in Kuma.

## Monitoring inclusion policy applied
- Added critical/live services as P0/P1 monitors.
- Added unstable or uncertain targets under `Experimental / Dev` as P3.
- Left placeholder websites disabled until authoritative domain confirmation.

## What is monitored now (inventory-driven)
- Websites / Client pages (placeholder, disabled)
- Command Center / OpenClaw
- MCP services
- Automation / n8n
- APIs
- Docker containers
- TCP ports
- Heartbeat jobs
- Security/reliability container checks
- Experimental/dev endpoints

## What cannot yet be fully monitored
- Public website SLA checks with strict alerting (domain list unverified).
- Alert fan-out routing (Telegram/Slack/Discord/Email/Webhook IDs not configured).
- Public tunnel DNS endpoint checks (hostname unknown).
