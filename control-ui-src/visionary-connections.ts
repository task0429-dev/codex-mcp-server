// visionary-connections.ts — Orbital flows and cross-system edges.
// Flow loops follow the circular universe topology.

import type { NamedFlow, CrossEdge } from "./visionary-types";

// ── Named Flow Loops ──────────────────────────────────────────────────────────

export const NAMED_FLOWS: NamedFlow[] = [
  {
    id: "lead-pipeline",
    label: "LEAD PIPELINE",
    color: "#ef4444",
    steps: ["public.site", "public.lead-capture", "auto.n8n", "auto.leads", "data.supabase"],
    corridor: "left",
  },
  {
    id: "command-chain",
    label: "COMMAND CHAIN",
    color: "#8b5cf6",
    steps: ["c2.runtime", "cortex.core", "mcp.server", "agents.abdi"],
    corridor: "left",
  },
  {
    id: "memory-loop",
    label: "MEMORY LOOP",
    color: "#84cc16",
    steps: ["agents.ahmed", "data.claude-memory", "cortex.memory", "cortex.core"],
    corridor: "left",
  },
  {
    id: "ops-response",
    label: "OPS RESPONSE",
    color: "#14b8a6",
    steps: ["mon.kuma", "agents.rex", "vps.docker"],
    corridor: "right",
  },
  {
    id: "access-gate",
    label: "ACCESS GATE",
    color: "#06b6d4",
    steps: ["portal.billing", "portal.auth", "portal.dashboard", "c2.runtime"],
    corridor: "right",
  },
  {
    id: "deploy-chain",
    label: "DEPLOY CHAIN",
    color: "#94a3b8",
    steps: ["vps.github", "vps.vercel", "vps.docker", "c2.runtime"],
    corridor: "right",
  },
];

// ── Cross-System Edges ────────────────────────────────────────────────────────

export const CROSS_EDGES: CrossEdge[] = [
  { from: "biz.tech-rescue",    to: "public.lead-capture", label: "intake",       color: "#8b5cf633" },
  { from: "biz.ai-packages",    to: "public.site",         label: "showcased on", color: "#8b5cf633" },
  { from: "public.lead-capture", to: "portal.dashboard",  label: "converts to",  color: "#ef444433" },
  { from: "portal.dashboard",    to: "c2.runtime",        label: "agent access", color: "#06b6d433" },
  { from: "portal.auth",         to: "data.supabase",     label: "auth store",   color: "#06b6d433" },
  { from: "portal.billing",      to: "data.supabase",     label: "billing data", color: "#06b6d433" },
  { from: "c2.runtime",          to: "cortex.core",       label: "control",      color: "#dc262633" },
  { from: "c2.voice",            to: "agents.abdi",       label: "voice cmd",    color: "#ec489933" },
  { from: "c2.runtime",          to: "agents.abdi",       label: "dispatch",     color: "#dc262622" },
  { from: "c2.runtime",          to: "agents.dame",       label: "dispatch",     color: "#dc262622" },
  { from: "c2.runtime",          to: "agents.ayub",       label: "dispatch",     color: "#dc262622" },
  { from: "cortex.core",         to: "mcp.server",        label: "tool dispatch", color: "#8b5cf633" },
  { from: "cortex.core",         to: "skills.codex-lib",  label: "uses skills",  color: "#8b5cf633" },
  { from: "mcp.server",          to: "agents.abdi",       label: "tools",        color: "#3b82f622" },
  { from: "mcp.server",          to: "agents.dame",       label: "tools",        color: "#3b82f622" },
  { from: "mcp.server",          to: "agents.ayub",       label: "tools",        color: "#3b82f622" },
  { from: "mcp.server",          to: "agents.claude",     label: "tools",        color: "#3b82f622" },
  { from: "mcp.openclaw",        to: "agents.dame",       label: "desktop",      color: "#0ea5e933" },
  { from: "mcp.openclaw",        to: "agents.prime",      label: "trading",      color: "#0ea5e933" },
  { from: "agents.sygma",        to: "auto.leads",        label: "owns",         color: "#f59e0b22" },
  { from: "agents.dame",         to: "auto.n8n",          label: "ops",          color: "#f59e0b22" },
  { from: "agents.atlas",        to: "auto.email",        label: "owns",         color: "#06b6d422" },
  { from: "agents.ahmed",        to: "data.claude-memory", label: "memory r/w",  color: "#84cc1633" },
  { from: "agents.ahmed",        to: "data.notion",       label: "docs",         color: "#84cc1633" },
  { from: "agents.ayub",         to: "data.supabase",     label: "db ops",       color: "#22c55e33" },
  { from: "auto.n8n",            to: "data.supabase",     label: "persist",      color: "#eab30833" },
  { from: "auto.leads",          to: "data.supabase",     label: "write leads",  color: "#eab30833" },
  { from: "data.claude-memory",  to: "cortex.memory",     label: "feeds",        color: "#84cc1644" },
  { from: "data.supabase",       to: "cortex.registry",   label: "state",        color: "#22c55e33" },
  { from: "data.notion",         to: "cortex.memory",     label: "knowledge",    color: "#84cc1633" },
  { from: "vps.docker",          to: "c2.runtime",        label: "runs",         color: "#22c55e22" },
  { from: "vps.docker",          to: "mcp.server",        label: "runs",         color: "#22c55e22" },
  { from: "vps.docker",          to: "auto.n8n",          label: "runs",         color: "#22c55e22" },
  { from: "vps.caddy",           to: "c2.runtime",        label: "proxies",      color: "#22c55e22" },
  { from: "vps.github",          to: "c2.runtime",        label: "deploys",      color: "#94a3b822" },
  { from: "vps.vercel",          to: "public.site",       label: "hosts",        color: "#94a3b822" },
  { from: "mon.kuma",            to: "vps.docker",        label: "watches",      color: "#14b8a633" },
  { from: "mon.kuma",            to: "c2.runtime",        label: "heartbeat",    color: "#14b8a633" },
  { from: "mon.logs",            to: "agents.rex",        label: "triage",       color: "#14b8a633" },
];

// ── Orbital ring metadata ─────────────────────────────────────────────────────

export const ORBIT_RINGS = [
  { id: "core",     label: "Cortex Core",        color: "#8b5cf6", radius: 0,    width: 180  },
  { id: "command",  label: "Command + Runtime",  color: "#dc2626", radius: 300,  width: 200  },
  { id: "skills",   label: "Skills",             color: "#a78bfa", radius: 480,  width: 120  },
  { id: "agents",   label: "Agent Workforce",    color: "#f59e0b", radius: 620,  width: 200  },
  { id: "tools",    label: "Tools + Automation", color: "#eab308", radius: 920,  width: 200  },
  { id: "data",     label: "Data + Memory",      color: "#84cc16", radius: 1200, width: 200  },
  { id: "business", label: "Business + Portal",  color: "#06b6d4", radius: 1520, width: 220  },
  { id: "perimeter",label: "Infrastructure",     color: "#22c55e", radius: 1850, width: 220  },
] as const;

// Layer zones — kept for SystemExplorer/InspectorPanel compatibility
export const LAYER_ZONES = [
  { layer: 1,  name: "Business Intent",         color: "#8b5cf6", yOffset: 0,    height: 280 },
  { layer: 2,  name: "Public Website & Growth", color: "#ef4444", yOffset: 340,  height: 300 },
  { layer: 3,  name: "Client Portal / SaaS",    color: "#06b6d4", yOffset: 700,  height: 280 },
  { layer: 4,  name: "C2 Command Center",       color: "#dc2626", yOffset: 1040, height: 360 },
  { layer: 5,  name: "Cortex Brain",            color: "#8b5cf6", yOffset: 1460, height: 400 },
  { layer: 6,  name: "MCP Runtime",             color: "#3b82f6", yOffset: 1920, height: 320 },
  { layer: 7,  name: "Agent Workforce",         color: "#f59e0b", yOffset: 2300, height: 380 },
  { layer: 8,  name: "Automation & Workflows",  color: "#eab308", yOffset: 2740, height: 320 },
  { layer: 9,  name: "Data / Memory / Logs",    color: "#84cc16", yOffset: 3120, height: 320 },
  { layer: 10, name: "Infrastructure / DevOps", color: "#22c55e", yOffset: 3500, height: 300 },
  { layer: 11, name: "Monitoring / Security",   color: "#14b8a6", yOffset: 3860, height: 260 },
  { layer: 12, name: "Revenue & Client Output", color: "#f97316", yOffset: 4180, height: 260 },
] as const;

export const TOTAL_CANVAS_HEIGHT = 4500;
export const CANVAS_WIDTH = 4200;
export const LEFT_CORRIDOR_X = -1900;
export const RIGHT_CORRIDOR_X = 1900;
export const NODE_BAND_LEFT = -1700;
export const NODE_BAND_RIGHT = 1700;
