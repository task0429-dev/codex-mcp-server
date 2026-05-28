# Task Enterprise Systems Universe — Ecosystem Rebuild Design Spec
**Date:** 2026-05-27
**Status:** Approved — In Implementation
**Owner:** TASK Enterprise / Ayub (builder)
**Approach:** Hybrid A+D+C — Living Infrastructure Terrain Map + Cortex Neural Ecosystem + Mission Control Clarity

---

## Problem Statement

The previous Visionary board was a radial hub-and-spoke scatter of shaped nodes. It communicated nothing about why systems exist, what they power, what depends on them, or how the full Task Enterprise machine works together. It was visually interesting but operationally useless.

The new board must answer ten questions from any zoom level:
1. Why does each system exist?
2. What does it power?
3. What depends on it?
4. What does it store?
5. What does it control?
6. Which tools/skills/agents use it?
7. What breaks if it goes down?
8. Where should new systems be added?
9. Which parts are missing, duplicated, weak, or disconnected?
10. How does the entire Task Enterprise machine work together?

---

## Architecture

### Mental Model

```
Business Vision
  ↓
Public Website / Growth / Lead Capture
  ↓
Client Portal / SaaS Access (PLANNED)
  ↓
C2 Command Center
  ↓
Cortex Brain ← ← ← Memory Loop (from Layer 9)
  ↓
MCP Runtime (Nervous System) ← Tools/Skills cross-cutting
  ↓
Agent Workforce
  ↓
Automations / Workflows / Workers
  ↓
Data / Memory / Logs ──→ loops back to Cortex
  ↓
Infrastructure / DevOps
  ↓
Monitoring / Security
  ↓
Revenue / Client Output
```

### File Structure

```
control-ui-src/
  visionary-types.ts       NEW  — all TypeScript types
  visionary-registry.ts    NEW  — full EcosystemNode registry (~80 nodes)
  visionary-connections.ts NEW  — named flows, cross-layer edges, corridor defs
  visionary-layout.ts      NEW  — zone bounds, cluster positions, corridor routing
  visionary-canvas.tsx     NEW  — UniverseCanvas, zone renderers, SVG routes, AgentDock
  visionary-inspector.tsx  NEW  — InspectorPanel, GapsOverlay, SystemExplorer
  pages-core.tsx           MOD  — thin VisionaryPage export only (3 lines)
```

### Data Model

```typescript
type NodeStatus = "healthy" | "degraded" | "offline" | "planned" | "unknown" | "registry-defined";

interface EcosystemNode {
  id: string;
  name: string;
  layer: number;              // 1–12
  type: NodeType;
  status: NodeStatus;
  color: string;
  ownerAgent: string | null;
  // Required semantic fields
  purpose: string;
  reasonBuilt: string;
  businessValue: string;
  failureImpact: string;
  dependencies: string[];
  powers: string[];
  toolsUsed: string[];
  skillsUsed: string[];
  risks: string[];
  missingPieces: string[];
  nextActions: string[];
  // Optional runtime
  runtime?: { container?; ports?; url?; host?; repo?; path? };
  health?: { endpoint?; command?; logsCommand?; restartCommand?; lastKnownState? };
  environment?: "local" | "vps" | "vercel" | "supabase" | "external" | "unknown";
  tags?: string[];
}
```

---

## 12-Layer Terrain Stack

| # | Layer | Color | Key Systems |
|---|-------|-------|-------------|
| 1 | Business Intent | #8b5cf6 | Tech Rescue, Sygma House, AI Packages, Trading |
| 2 | Public Website & Growth | #ef4444 | taskenterprise.tech, Lead Capture, Cloudflare |
| 3 | Client Portal / SaaS | #06b6d4 | Auth, Billing, Dashboard (all PLANNED) |
| 4 | C2 Command Center | #dc2626 | Runtime, Redis, Voice, Projects, Memory, Visionary |
| 5 | Cortex Brain ★ | #8b5cf6 | Command Brain, Registry, Memory Index, Skills ring |
| 6 | MCP Runtime | #3b82f6 | MCP Core, OpenClaw, Relay, Mirror, OpenRouter + Tools |
| 7 | Agent Workforce | #f59e0b | All 10 agents with owned systems + tools + skills |
| 8 | Automation & Workflows | #eab308 | n8n, Lead Flows, Scheduled Jobs, CRM/Email (PLANNED) |
| 9 | Data / Memory / Logs | #84cc16 | Supabase, Claude Memory, Notion, GDrive, Graphify |
| 10 | Infrastructure / DevOps | #22c55e | Docker, Caddy, VPS, GitHub, Vercel |
| 11 | Monitoring / Security | #14b8a6 | Uptime Kuma, Container Logs, Recovery |
| 12 | Revenue / Client Output | #f97316 | Paid Services, Subscriptions, Portal Output (PLANNED) |

---

## Named Data Flows (6)

| ID | Label | Route | Corridor |
|----|-------|-------|----------|
| lead-pipeline | LEAD PIPELINE | Public → Lead Capture → n8n → Supabase | left |
| command-chain | COMMAND CHAIN | C2 → Cortex → MCP → Tools → Agents | center |
| memory-loop | MEMORY LOOP | Agents → Logs/Memory → Cortex | left |
| ops-response | OPS RESPONSE | Monitoring → Rex/Abdi → Recovery | right |
| access-gate | ACCESS GATE | Stripe → Portal → Paid Tools | right |
| deploy-chain | DEPLOY CHAIN | GitHub → Vercel/VPS → Website/C2 | right |

---

## Rendering Rules

- **Canvas:** CSS transform translate+scale on world-space div, origin 0 0
- **Zones:** Each layer = horizontal band with Y-range, region border, label pinned left
- **Clusters:** Nodes within zones arranged in sub-groups, not single rows
- **Line separation:** SVG routes travel through corridor columns (x < -500 or x > 500). Node chips placed between x=-480 and x=+480. No horizontal line segment inside node band.
- **Zoom reveals:** <15% zone labels only; 15–50% node shapes; >50% full detail + inspector
- **Planned nodes:** 50% opacity, dashed border, purple PLANNED badge
- **Registry-defined:** amber ⚠ badge in inspector, no green dot
- **Memory loop:** dashed neural path, left corridor, bottom-to-top Cortex return
- **Tools/Skills:** attached to MCP and Cortex as sub-clusters, agent badges at >100% zoom
- **AgentDock:** pinned to viewport bottom, not part of scrollable terrain

---

## Validation Checklist

- [ ] Build passes (exit 0, no TS errors)
- [ ] All existing pages unaffected
- [ ] VisionaryPage renders with no console errors
- [ ] 12 layer zones visible with labels and colors
- [ ] ~80 nodes placed without overlap
- [ ] No text over lines anywhere on canvas
- [ ] 6 named flows labeled and routed through corridors
- [ ] Planned nodes visually distinct (dashed, dimmed, PLANNED badge)
- [ ] Registry-defined nodes show amber badge in inspector
- [ ] InspectorPanel shows all 12 node fields
- [ ] GapsOverlay present and populated
- [ ] Client Portal at Layer 3 (between Public and C2)
- [ ] Tools/Skills cross-cutting (attached to MCP/Cortex/Agents)
- [ ] Memory loop neural path visible
- [ ] AgentDock pinned to viewport, 10 agents
- [ ] Pan/zoom/flyTo all work
- [ ] Zoom reveal states correct
- [ ] Deployed and live at cc.taskenterprise.tech

---

## Gaps / Known Missing Pieces

| Gap | Severity | Notes |
|-----|----------|-------|
| Client Portal (all) | HIGH | Auth, billing, dashboard all planned |
| CRM Workflows | HIGH | Leads captured but not persisted |
| Email Automation | MED | No outbound sequences |
| Supabase full schema | MED | Exists but not fully structured |
| Concierge Agent | MED | Spec approved, not deployed |
| Claude → Voice Tab wiring | LOW | Agent on board, not in voice |
| Live health data | LOW | Registry-defined throughout |

---

## Future Backend Wiring Points

- `status` fields ← Docker health API / Uptime Kuma heartbeat
- Agent `status` ← `/api/agents/live`
- MCP tool counts ← `/api/command-center` → `summary.enabledTools`
- n8n workflow status ← n8n API at `:3001`
- Supabase ← Supabase MCP tools
- Lead counts ← Supabase leads table row count
