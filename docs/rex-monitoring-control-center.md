# Rex Monitoring Control Center

## Philosophy
Rex operates this environment as a reliability system, not a monitor list.

Architecture model:
1. Inventory brain: `monitoring/rex-monitor-inventory.json`
2. Watchdog execution: Uptime Kuma
3. Job proof-of-life: push heartbeats
4. Controlled escalation: P0/P1 notify, P2/P3 silent

Uptime Kuma is the watchdog, not the source of truth.

## Monitor structure
Primary groups:
- Websites
- Client / Public Pages
- Command Center / OpenClaw
- MCP Services
- Automation / n8n
- APIs
- Servers / Hosts
- Docker / Containers
- Ports / TCP
- Heartbeat Jobs
- Security / Reliability
- Experimental / Dev

Naming convention:
- `CATEGORY - Service :port`
- Examples:
  - `MCP - HTTP Health :3000`
  - `OPENCLAW - Gateway Public :61299`
  - `HEARTBEAT - Rex Agent Loop`

## Priority tiers
- P0: Core control-plane / business-critical. Immediate alerting.
- P1: Important and actionable. Alerting enabled with sensible cadence.
- P2: Supporting checks. Log-only at start.
- P3: Experimental, uncertain, or non-authoritative. Silent by default.

## Heartbeat strategy
Use push monitors for systems that must prove they are alive:
- scheduled workflows
- background automation
- agent loops
- backup/sync/report jobs

Required fields per heartbeat monitor:
- `heartbeat=true`
- `expected_interval`
- `tolerance_missed_cycles`

Stale logic:
- Alert condition begins only after multiple missed cycles.
- Effective stale window = `expected_interval * tolerance_missed_cycles`.

## Escalation logic
1. P0 down/stale: immediate incident response.
2. P1 down/stale: triage with owner assignment.
3. P2 down/stale: backlog unless business impact emerges.
4. P3 down/stale: observe only; promote if it becomes operational.

## Rex operational role
Rex owns:
- uptime awareness
- early issue detection
- stale-job detection
- silent-failure detection
- visibility of local + public surfaces

Rex does not replace service owners; Rex surfaces priority and state quickly.

## Extension model
When adding a service:
1. Add to inventory first.
2. Assign group, tags, type, and P-tier.
3. Add heartbeat definition for recurring jobs.
4. Re-run provisioning script.
5. Validate monitor behavior and noise profile.

For client expansion:
- use clear tags per client/workspace
- keep defaults conservative (silent P2/P3)
- promote tiers only after ownership and impact are clear
