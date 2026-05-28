// visionary-layout.ts — Orbital layout engine.
// Places every node in polar (ring, angle) coordinates forming a circular universe.
// Cortex at center. Rings expand outward by system category.

import type { EcosystemNode } from "./visionary-types";
import { REGISTRY } from "./visionary-registry";

export interface NodePosition {
  x: number;
  y: number;
}

// ── Orbital ring radii ────────────────────────────────────────────────────────

export const RING_RADII = {
  core:         0,    // Cortex — dead center
  command:      300,  // C2 + MCP — inner orbit
  agents:       620,  // Agents — operator ring
  tools:        920,  // Tools, skills, automation — capability ring
  data:         1200, // Memory, data, logs — storage ring
  business:     1520, // Public, portal, business — client ring
  perimeter:    1850, // Monitoring, infra, deployment — outer shield
} as const;

// Universe canvas is centered at (0,0) in world-space.
// Viewport offset added in camera state.
export const UNIVERSE_CENTER_X = 0;
export const UNIVERSE_CENTER_Y = 0;
export const UNIVERSE_RADIUS = RING_RADII.perimeter + 200;
export const UNIVERSE_DIAMETER = UNIVERSE_RADIUS * 2 + 400;

// ── Orbital placement map ─────────────────────────────────────────────────────
// Each entry: { ring radius, angle in degrees (0 = top/north, clockwise) }
// Sectors: North=top, East=right, South=bottom, West=left

const DEG = Math.PI / 180;

function polar(r: number, angleDeg: number): NodePosition {
  // 0° = top (north), goes clockwise
  const rad = (angleDeg - 90) * DEG;
  return {
    x: Math.round(r * Math.cos(rad)),
    y: Math.round(r * Math.sin(rad)),
  };
}

// Spread N items evenly across an arc from startDeg to endDeg at radius r
function spreadArc(r: number, startDeg: number, endDeg: number, n: number): NodePosition[] {
  if (n === 1) return [polar(r, (startDeg + endDeg) / 2)];
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return polar(r, startDeg + t * (endDeg - startDeg));
  });
}

// ── Manual placement table ────────────────────────────────────────────────────
// Precise placement for key landmark nodes. Others computed automatically.

const MANUAL_POSITIONS: Record<string, NodePosition> = {
  // ── Core (center) ──
  "cortex.core":    { x: 0, y: 0 },
  "cortex.registry":{ x: -140, y: -60 },
  "cortex.memory":  { x: 140, y: -60 },

  // ── Command ring (ring 1, r=300) ──
  // C2 cluster: northwest quadrant
  "c2.runtime":     polar(300, 315),
  "c2.redis":       polar(260, 295),
  "c2.voice":       polar(260, 335),
  "c2.projects":    polar(340, 305),
  "c2.memory-tab":  polar(340, 325),
  "c2.visionary":   polar(340, 345),

  // MCP cluster: northeast quadrant
  "mcp.server":     polar(300, 45),
  "mcp.openclaw":   polar(260, 25),
  "mcp.openrouter": polar(260, 65),
  "mcp.relay":      polar(340, 35),

  // ── Agent ring (ring 2, r=620) ──
  // Arranged in a full ring, spaced evenly, with sector grouping:
  // North-East: Abdi (CEO, top presence), Atlas (marketing - public facing)
  // East: Ayub (builder), Dame (ops/local)
  // South-East: Rex (infra), Ahmed (memory)
  // South: Claude, Codex (assistant/execution)
  // South-West: Sygma (ops/care), Prime (trading)
  "agents.abdi":    polar(620, 0),     // North
  "agents.atlas":   polar(620, 36),    // NNE
  "agents.ayub":    polar(620, 72),    // NE
  "agents.dame":    polar(620, 108),   // ENE
  "agents.rex":     polar(620, 144),   // ESE
  "agents.ahmed":   polar(620, 180),   // South (memory flows west)
  "agents.claude":  polar(620, 216),   // SSW
  "agents.codex":   polar(620, 252),   // SW
  "agents.prime":   polar(620, 288),   // WSW
  "agents.sygma":   polar(620, 324),   // NNW

  // ── Skills (attached to Cortex/agents on ring 1.5) ──
  "skills.codex-lib":      polar(480, 10),
  "skills.memory":         polar(480, 355),
  "skills.brainstorming":  polar(480, 340),
  "skills.debugging":      polar(480, 25),
  "skills.writing-plans":  polar(480, 40),
  "skills.mcp-builder":    polar(480, 55),
  "skills.superpowers":    polar(480, 70),
  "skills.frontend-design":polar(480, 85),

  // ── Tools / Automation ring (ring 3, r=920) ──
  // East sector: tools and integrations
  // South sector: automation workflows
  // West sector: data stores double-duty
  "auto.n8n":       polar(920, 120),
  "auto.leads":     polar(920, 140),
  "auto.scheduled": polar(920, 160),
  "auto.crm":       polar(920, 180),
  "auto.email":     polar(920, 200),
  "auto.postgres":  polar(920, 220),

  // ── Data / Memory ring (ring 4, r=1200) ──
  // West sector: memory and data flows back into Cortex from the west
  "data.claude-memory": polar(1200, 240),
  "data.notion":        polar(1200, 260),
  "data.gdrive":        polar(1200, 280),
  "data.supabase":      polar(1200, 210),
  "data.graphify":      polar(1200, 300),

  // ── Business / Portal / Public ring (ring 5, r=1520) ──
  // North sector: public-facing (website, growth)
  // NW: business intent / services
  // NE: portal / client access
  "public.site":        polar(1520, 0),
  "public.services":    polar(1520, 20),
  "public.lead-capture":polar(1520, 340),
  "public.cloudflare":  polar(1520, 320),
  "biz.tech-rescue":    polar(1520, 300),
  "biz.sygma-house":    polar(1520, 280),
  "biz.ai-packages":    polar(1520, 260),
  "biz.trading":        polar(1520, 40),
  "portal.auth":        polar(1520, 60),
  "portal.billing":     polar(1520, 80),
  "portal.dashboard":   polar(1520, 100),

  // ── Monitoring / Infra perimeter (ring 6, r=1850) ──
  // Wraps around the full circle like a shield
  "vps.docker":      polar(1850, 90),
  "vps.caddy":       polar(1850, 120),
  "vps.cloudflared": polar(1850, 150),
  "vps.github":      polar(1850, 180),
  "vps.vercel":      polar(1850, 210),
  "mon.kuma":        polar(1850, 270),
  "mon.logs":        polar(1850, 300),
  "biz.revenue":     polar(1850, 0),
};

// ── Public layout map ─────────────────────────────────────────────────────────

export const LAYOUT: Map<string, NodePosition> = new Map(
  REGISTRY.map(n => [n.id, MANUAL_POSITIONS[n.id] ?? { x: 0, y: 0 }])
);

export function getPos(id: string): NodePosition {
  return LAYOUT.get(id) ?? { x: 0, y: 0 };
}

// ── Edge path helpers ─────────────────────────────────────────────────────────
// All paths are cubic beziers curving through the center of the universe.
// This naturally creates circular arc-like routes.

export function arcEdgePath(fromId: string, toId: string, curveFactor = 0.3): string {
  const from = getPos(fromId);
  const to = getPos(toId);
  if (!from || !to) return "";

  // Control points: pull toward center with curvature
  const cx1 = from.x * (1 - curveFactor);
  const cy1 = from.y * (1 - curveFactor);
  const cx2 = to.x * (1 - curveFactor);
  const cy2 = to.y * (1 - curveFactor);

  return `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`;
}

// Orbital arc path — routes along a ring between two nodes at same radius
export function orbitalArcPath(fromId: string, toId: string): string {
  const from = getPos(fromId);
  const to = getPos(toId);
  if (!from || !to) return "";

  const r = Math.sqrt(from.x * from.x + from.y * from.y);
  if (r < 10) return arcEdgePath(fromId, toId);

  // Midpoint arc through orbital ring
  const midAngle = (Math.atan2(from.y, from.x) + Math.atan2(to.y, to.x)) / 2;
  const mx = Math.cos(midAngle) * r;
  const my = Math.sin(midAngle) * r;

  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
}

// Named flow path — a curved arc through space between sequential steps
export function flowPath(steps: string[]): string {
  if (steps.length < 2) return "";
  const positions = steps.map(id => getPos(id)).filter(p => p.x !== 0 || p.y !== 0);
  if (positions.length < 2) return "";

  let d = `M ${positions[0].x} ${positions[0].y}`;
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    // Pull control points 25% toward center
    const cp1x = prev.x * 0.75;
    const cp1y = prev.y * 0.75;
    const cp2x = curr.x * 0.75;
    const cp2y = curr.y * 0.75;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

// Straight-line path (kept for compatibility)
export function directEdgePath(fromId: string, toId: string): string {
  return arcEdgePath(fromId, toId, 0.25);
}

// Fit camera to show the full universe circle
export function fitCameraOrbital(viewportW: number, viewportH: number, padding = 80): { x: number; y: number; z: number } {
  const diameter = UNIVERSE_DIAMETER;
  const z = Math.min(
    (viewportW - padding * 2) / diameter,
    (viewportH - padding * 2) / diameter
  );
  // Center of universe maps to center of viewport
  const x = viewportW / 2;
  const y = viewportH / 2;
  return { x, y, z };
}
