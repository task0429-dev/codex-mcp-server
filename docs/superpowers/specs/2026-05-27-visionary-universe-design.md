# Visionary Universe — Design Spec
**Date:** 2026-05-27  
**Status:** Implemented  
**Owner:** TASK Enterprise / Ayub (builder)

---

## Overview

The Visionary tab in the C2 Command Center is a full interactive "Task Enterprise Systems Universe" — a zoomable, pannable infrastructure map showing every platform, service, agent, workflow, container, integration, and business system owned by Task Enterprise.

This is a production operational command map, not a static graphic. It replaces the previous `InfrastructureVisionBoard` component.

---

## Architecture

### Data Model

Central `SystemNode` type with the following fields:

```ts
type SystemNode = {
  id: string;
  name: string;
  type: "world" | "system" | "service" | "container" | "agent" | "database" | 
        "api" | "workflow" | "integration" | "website" | "portal" | "monitor" | 
        "memory" | "deployment";
  parentId?: string;
  description: string;
  status: "healthy" | "degraded" | "offline" | "unknown" | "planned" | "experimental";
  environment?: "local" | "vps" | "vercel" | "supabase" | "external" | "unknown";
  ownerAgent?: string;
  tags: string[];
  position: { x: number; y: number };
  color: string;
  icon: string;
  runtime?: { container?; ports?; url?; host?; repo?; path? };
  health?: { endpoint?; command?; logsCommand?; restartCommand?; lastKnownState? };
  dependencies?: string[];
  risks?: string[];
  nextActions?: string[];
  children?: SystemNode[];
};
```

All data is `registry-defined` (not live backend data). Future wiring point: replace registry values with API responses from Docker, Kuma, Supabase, etc.

### Component Structure

```
VisionaryPage
  └─ VisionaryUniverse
       ├─ [top bar] — breadcrumb + search + fit button + explorer toggle
       ├─ SystemExplorer (left panel, 220px)
       ├─ UniverseCanvas (main canvas, fills remaining space)
       │    ├─ SVG layer — world connection edges + child connector lines
       │    └─ HTML layer — world nodes + child nodes (CSS transformed)
       ├─ InspectorPanel (right panel, 340px, conditional)
       └─ StatusRail (bottom bar, 26px)
```

### Camera System

CSS transform on a world-space `<div>`:  
`transform: translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`

- Pan: drag (mouse drag accumulates delta from pan start)
- Zoom: wheel (zoom toward cursor, `z = clamp(0.05, 14, z * delta)`)
- Fit: recalculates z to fit all nodes in viewport with 80% fill

---

## Worlds (12 Zones)

| ID | Name | Color | Status | Environment |
|----|------|-------|--------|-------------|
| `public` | Public Business Systems | #ef4444 | healthy | vercel |
| `c2` | C2 Command Center | #ef4444 | healthy | vps |
| `mcp` | MCP Runtime | #3b82f6 | healthy | vps |
| `agents` | Agent Workforce | #f59e0b | healthy | vps |
| `cortex` | Cortex | #ffffff | healthy | vps |
| `vps` | VPS / DevOps Layer | #22c55e | healthy | vps |
| `automation` | Automation Systems | #f59e0b | healthy | vps |
| `data` | Data / Memory Layer | #84cc16 | healthy | supabase |
| `monitoring` | Monitoring / Ops | #f59e0b | healthy | vps |
| `business` | Business Systems | #8b5cf6 | healthy | unknown |
| `portal` | Client Portal (Planned) | #06b6d4 | planned | unknown |
| `skills` | Codex Skills | #06b6d4 | healthy | local |

Each world has 3–9 child nodes representing internal systems/services.

---

## World Connections (18 Edges)

Cross-world edges rendered as dashed SVG paths with quadratic curves:

- agents → mcp (TOOL CALLS)
- agents → cortex (COMMANDS)
- c2 → agents (DISPATCH)
- c2 → cortex (CONTROL)
- mcp → vps (HOSTED ON)
- c2 → vps (HOSTED ON)
- automation → data (READ/WRITE)
- automation → vps (RUNS ON)
- public → automation (LEADS)
- public → vps (CF TUNNEL)
- agents → data (MEMORY)
- monitoring → vps (WATCHES)
- cortex → data (MEMORY)
- cortex → skills (USES)
- business → automation (CRM)
- portal → c2 (AGENT ACCESS)
- portal → data (CLIENT DATA)
- c2 → skills (RUNS SKILLS)

---

## Key Systems Detail

### VPS Containers (actual Docker container names)
- `task-command-center` — C2 app, port 3000
- `task-command-center-caddy` — reverse proxy, ports 80/443
- `task-command-center-redis` — Redis cache, port 6379
- `task-cloudflared` — Cloudflare tunnel
- `n8n` — automation engine, port 3001
- `n8n-stack-postgres-1` — Postgres for n8n, port 5432
- `task-project-monitor` — Uptime Kuma, port 3011

### MCP Server Ports
- `:3000` — MCP HTTP main
- `:4000` — MCP Mirror
- `:61299` — OpenClaw Gateway
- `:3099` — MCP Relay

### Agent Colors (canonical from agent-constants.ts)
- Abdi: `#ef4444` (red)
- Dame: `#f59e0b` (amber)
- Ayub: `#3b82f6` (blue)
- Ahmed: `#84cc16` (lime)
- Atlas: `#06b6d4` (cyan)
- Rex: `#22c55e` (green)
- Prime: `#8b5cf6` (violet)
- Sygma: `#ec4899` (pink)
- Codex: `#e2e8f0` (white/dashed — OpenAI runtime)

---

## UX

### Navigation
- **Breadcrumb**: Universe → World → System
- **Search**: filters both explorer list and highlights matching nodes
- **Explorer**: left panel tree, toggleable
- **Inspector**: right panel, opens on click
- **Status rail**: counts healthy/degraded/offline/planned systems
- **Fit button**: zooms to fit entire universe

### Zoom Behavior
- Zoom range: 5% – 1400%
- Child nodes hide below ~18% zoom (world overview)
- Child labels hide below ~50% zoom
- Child status text hides below ~75% zoom
- Edge labels hide below ~30% zoom

### Inspector Panel (per-node)
Shows: name, type, status chip, environment chip, owner agent, description, runtime details (container, host, ports, url, path), health commands (endpoint, health check, logs, restart), dependencies, tags, risks, next actions.

---

## Implementation Notes

- All components in `control-ui-src/pages-core.tsx` starting at line ~2000
- Registry: `REGISTRY: SystemNode[]` constant — data-driven, no hardcoded UI
- Status color helper: `sysStatusColor(status)` returns hex color per status
- Bounds helper: `getWorldBounds(world)` computes zone boundary box from child positions
- Flatten helper: `flattenRegistry(nodes)` returns `Map<id, node>` for O(1) lookups
- Build: `node scripts/build-control-ui.mjs` → `control-ui/assets/app.js`
- Deploy: `scp app.js root@187.77.211.125:/opt/task-command-center/mcp-server/control-ui/assets/`
- Restart: `docker restart task-command-center`

---

## Future Wiring Points

The registry is structured to support live backend integration:

- `status` fields ← Docker health API / Kuma heartbeat API
- `health.lastKnownState` ← `/api/command-center` response
- Agent `status` ← `/api/agents/live`
- MCP tool counts ← `/api/command-center` → `summary.enabledTools`
- n8n workflow status ← n8n API at `:3001`
- Supabase ← Supabase MCP tools

Any field not live is implicitly `registry-defined`.
