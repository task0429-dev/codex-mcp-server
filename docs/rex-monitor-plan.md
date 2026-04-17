# Rex Monitor Plan

Derived from `monitoring/rex-monitor-inventory.json` (authoritative source).

| Name | Type | Target | Interval(s) | Timeout(s) | Retries | Priority | Purpose |
|---|---|---:|---:|---:|---:|---|---|
| MCP - HTTP Health :3000 | http | http://localhost:3000/health | 30 | 8 | 2 | P0 | Primary MCP service health endpoint used as Rex control-plane baseline. |
| MCP - HTTP Mirror :4000 | http | http://localhost:4000/health | 45 | 8 | 2 | P1 | Mirror route check for MCP availability through the secondary mapped port. |
| MCP - Ready Endpoint :3000 | http | http://localhost:3000/ready | 30 | 8 | 2 | P0 | MCP readiness check for dependencies and startup integrity. |
| COMMAND - Uptime Kuma Dashboard :3011 | http | http://localhost:3011/dashboard | 30 | 8 | 2 | P0 | Rex watchdog dashboard availability check. |
| OPENCLAW - Gateway Public :61299 | http | http://187.77.211.125:61299/health | 45 | 10 | 2 | P1 | Public OpenClaw gateway health candidate currently reachable from host checks. |
| OPENCLAW - Desktop Relay :3099 | http | http://localhost:3099/health | 60 | 8 | 1 | P3 | Local desktop relay endpoint currently unreachable; tracked for diagnostics only. |
| AUTOMATION - n8n Healthz :3001 | http | http://localhost:3001/healthz | 30 | 8 | 2 | P0 | n8n health endpoint for workflow engine reliability. |
| AUTOMATION - n8n UI :3001 | http | http://localhost:3001/ | 60 | 10 | 2 | P1 | n8n web interface availability for operator access. |
| API - MCP Tools Endpoint :3000 | http | http://localhost:3000/api/tools | 60 | 10 | 2 | P1 | API-level availability check for tool registry endpoint. |
| PORT - MCP TCP :3000 | tcp | localhost:3000 | 30 | 8 | 2 | P1 | Raw TCP socket check for MCP service port. |
| PORT - n8n TCP :3001 | tcp | localhost:3001 | 30 | 8 | 2 | P1 | Raw TCP socket check for n8n service port. |
| PORT - Postgres Local :5432 | tcp | localhost:5432 | 60 | 8 | 2 | P2 | Local PostgreSQL socket reachability for supporting services. |
| DOCKER - codex-mcp-server-mcp-server-1 | docker | codex-mcp-server-mcp-server-1 | 30 | 10 | 2 | P0 | Container lifecycle check for primary MCP runtime. |
| DOCKER - task-project-monitor | docker | task-project-monitor | 30 | 10 | 2 | P0 | Container lifecycle check for Uptime Kuma watchdog. |
| DOCKER - n8n | docker | n8n | 45 | 10 | 2 | P1 | Container lifecycle check for n8n workflow runtime. |
| DOCKER - task-cloudflared | docker | task-cloudflared | 60 | 10 | 2 | P2 | Cloudflared tunnel container reliability (known intermittent failures). |
| DOCKER - task0429-db-1 | docker | task0429-db-1 | 60 | 10 | 1 | P3 | Restart-looping Postgres container tracked as experimental until ownership is confirmed. |
| DOCKER - n8n-stack-postgres-1 | docker | n8n-stack-postgres-1 | 60 | 10 | 2 | P2 | Backing Postgres container health for n8n stack continuity. |
| SITE - taskenterprise.tech | http | https://taskenterprise.tech | 120 | 12 | 1 | P3 | Placeholder public site monitor pending authoritative domain validation. |
| SITE - intake.taskenterprise.tech | http | https://intake.taskenterprise.tech | 120 | 12 | 1 | P3 | Placeholder intake page monitor pending DNS and ownership confirmation. |
| HEARTBEAT - Project2 Strike Run | push | heartbeat://project2-strike-run | 60 | 10 | 2 | P1 | Scheduled strike run should check in every hour during active operating windows. |
| HEARTBEAT - Project2 Launch Verify | push | heartbeat://project2-launch-verify | 60 | 10 | 2 | P1 | Launch verification workflow should report every 6 hours or on manual run completion. |
| HEARTBEAT - Project2 Notion Replay | push | heartbeat://project2-notion-replay | 60 | 10 | 2 | P2 | Notion replay job check-in to detect stale queue processing without paging. |
| HEARTBEAT - Nightly Backup Job | push | heartbeat://nightly-backup-job | 60 | 10 | 2 | P1 | Nightly backup proof-of-life signal from backup executor (Windows or WSL). |
| HEARTBEAT - Rex Agent Loop | push | heartbeat://rex-agent-loop | 60 | 10 | 2 | P0 | Primary Rex agent loop heartbeat; stale check-in indicates silent control-plane failure. |
| HOST - Localhost Loopback | ping | 127.0.0.1 | 60 | 8 | 1 | P2 | Baseline host reachability check for local machine network stack. |
