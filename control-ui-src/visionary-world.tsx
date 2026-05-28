// visionary-world.tsx — Visual infrastructure world rendering.
// Replaces text-first NodeChip/ZoneBand with SVG landmark shapes + terrain.

import React from "react";
import { getPos } from "./visionary-layout";
import { LAYER_ZONES, LEFT_CORRIDOR_X, RIGHT_CORRIDOR_X } from "./visionary-connections";
import { agentColor } from "./agent-constants";
import type { EcosystemNode } from "./visionary-types";

// ── Visual node kind mapping ──────────────────────────────────────────────────

export type VisualNodeKind =
  | "command_tower"    // C2, Cortex — tall landmark
  | "brain_core"       // cortex.core — central brain
  | "runtime_hub"      // MCP server — reactor hub
  | "agent_station"    // each agent — hex station
  | "tool_module"      // tools — small module
  | "skill_crystal"    // skills — diamond crystal
  | "workflow_rail"    // automation — conveyor node
  | "database_vault"   // supabase, postgres — vault
  | "memory_archive"   // claude-memory, notion — archive
  | "monitoring_radar" // kuma, logs — radar dish
  | "deployment_pad"   // github, vercel, docker — launch pad
  | "server_tower"     // VPS, caddy — server rack
  | "website_gate"     // public site — front gate
  | "portal_gate"      // portal nodes — secured gate
  | "revenue_terminal" // revenue output — delivery terminal
  | "service_outpost"  // business service — outpost
  | "planned_blueprint"; // planned — ghost blueprint

const KIND_MAP: Record<string, VisualNodeKind> = {
  // Layer 1 — Business
  "biz.tech-rescue":   "service_outpost",
  "biz.sygma-house":   "service_outpost",
  "biz.ai-packages":   "service_outpost",
  "biz.trading":       "tool_module",
  // Layer 2 — Public
  "public.site":       "website_gate",
  "public.services":   "website_gate",
  "public.lead-capture":"workflow_rail",
  "public.cloudflare": "monitoring_radar",
  // Layer 3 — Portal (planned)
  "portal.auth":       "planned_blueprint",
  "portal.billing":    "planned_blueprint",
  "portal.dashboard":  "planned_blueprint",
  // Layer 4 — C2
  "c2.runtime":        "command_tower",
  "c2.redis":          "database_vault",
  "c2.voice":          "tool_module",
  "c2.projects":       "tool_module",
  "c2.memory-tab":     "memory_archive",
  "c2.visionary":      "tool_module",
  // Layer 5 — Cortex + Skills
  "cortex.core":       "brain_core",
  "cortex.registry":   "memory_archive",
  "cortex.memory":     "memory_archive",
  "skills.codex-lib":  "skill_crystal",
  "skills.memory":     "skill_crystal",
  "skills.brainstorming":"skill_crystal",
  "skills.debugging":  "skill_crystal",
  "skills.writing-plans":"skill_crystal",
  "skills.mcp-builder":"skill_crystal",
  "skills.superpowers":"skill_crystal",
  "skills.frontend-design":"skill_crystal",
  // Layer 6 — MCP
  "mcp.server":        "runtime_hub",
  "mcp.openclaw":      "runtime_hub",
  "mcp.openrouter":    "tool_module",
  "mcp.relay":         "tool_module",
  // Layer 7 — Agents
  "agents.abdi":       "agent_station",
  "agents.dame":       "agent_station",
  "agents.ayub":       "agent_station",
  "agents.ahmed":      "agent_station",
  "agents.atlas":      "agent_station",
  "agents.rex":        "agent_station",
  "agents.prime":      "agent_station",
  "agents.sygma":      "agent_station",
  "agents.codex":      "agent_station",
  "agents.claude":     "agent_station",
  // Layer 8 — Automation
  "auto.n8n":          "workflow_rail",
  "auto.leads":        "workflow_rail",
  "auto.scheduled":    "workflow_rail",
  "auto.crm":          "planned_blueprint",
  "auto.email":        "planned_blueprint",
  "auto.postgres":     "database_vault",
  // Layer 9 — Data
  "data.supabase":     "database_vault",
  "data.claude-memory":"memory_archive",
  "data.notion":       "memory_archive",
  "data.gdrive":       "memory_archive",
  "data.graphify":     "tool_module",
  // Layer 10 — Infra
  "vps.docker":        "server_tower",
  "vps.caddy":         "server_tower",
  "vps.cloudflared":   "server_tower",
  "vps.github":        "deployment_pad",
  "vps.vercel":        "deployment_pad",
  // Layer 11 — Monitoring
  "mon.kuma":          "monitoring_radar",
  "mon.logs":          "monitoring_radar",
  // Layer 12 — Revenue
  "biz.revenue":       "revenue_terminal",
};

export function getNodeKind(id: string, node: EcosystemNode): VisualNodeKind {
  if (node.status === "planned") return "planned_blueprint";
  return KIND_MAP[id] ?? "service_outpost";
}

// ── Shape dimensions per kind ─────────────────────────────────────────────────

export const KIND_SIZE: Record<VisualNodeKind, { w: number; h: number }> = {
  brain_core:       { w: 200, h: 200 },
  command_tower:    { w: 130, h: 130 },
  runtime_hub:      { w: 120, h: 120 },
  agent_station:    { w: 100, h: 100 },
  database_vault:   { w: 100, h: 90 },
  memory_archive:   { w: 100, h: 80 },
  monitoring_radar: { w: 90,  h: 90 },
  deployment_pad:   { w: 90,  h: 80 },
  server_tower:     { w: 80,  h: 90 },
  website_gate:     { w: 120, h: 90 },
  portal_gate:      { w: 110, h: 90 },
  service_outpost:  { w: 110, h: 80 },
  revenue_terminal: { w: 120, h: 90 },
  workflow_rail:    { w: 100, h: 70 },
  tool_module:      { w: 80,  h: 70 },
  skill_crystal:    { w: 70,  h: 70 },
  planned_blueprint:{ w: 110, h: 80 },
};

// ── SVG Shape Renderers ───────────────────────────────────────────────────────
// All shapes are rendered at (0,0) center, SVG viewBox centered.

function BrainCore({ c, pulse }: { c: string; pulse?: boolean }) {
  return (
    <g>
      {/* Outer ring pulse */}
      <circle cx={0} cy={0} r={95} fill="none" stroke={c} strokeWidth={1} opacity={0.12}>
        {pulse && <animate attributeName="r" values="90;100;90" dur="3s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.12;0.05;0.12" dur="3s" repeatCount="indefinite" />}
      </circle>
      <circle cx={0} cy={0} r={72} fill="none" stroke={c} strokeWidth={1} opacity={0.2}>
        {pulse && <animate attributeName="r" values="70;74;70" dur="2.4s" repeatCount="indefinite" />}
      </circle>
      {/* Neural orbit lines */}
      {[0, 60, 120, 180, 240, 300].map(angle => {
        const rad = (angle * Math.PI) / 180;
        return <line key={angle} x1={0} y1={0} x2={Math.cos(rad) * 68} y2={Math.sin(rad) * 68} stroke={c} strokeWidth={0.8} opacity={0.2} />;
      })}
      {/* Core glow */}
      <circle cx={0} cy={0} r={52} fill={`${c}18`} stroke={c} strokeWidth={2} opacity={0.9} />
      <circle cx={0} cy={0} r={40} fill={`${c}22`} />
      <circle cx={0} cy={0} r={28} fill={`${c}35`} />
      {/* Center nucleus */}
      <circle cx={0} cy={0} r={14} fill={c} opacity={0.9}>
        {pulse && <animate attributeName="opacity" values="0.9;0.6;0.9" dur="2s" repeatCount="indefinite" />}
      </circle>
      {/* Icon: brain */}
      <text x={0} y={6} textAnchor="middle" fontSize={18} fill="#020817" fontFamily="system-ui">🧠</text>
    </g>
  );
}

function CommandTower({ c, isSelected }: { c: string; isSelected: boolean }) {
  return (
    <g>
      {/* Base plate */}
      <ellipse cx={0} cy={45} rx={52} ry={10} fill={`${c}20`} stroke={c} strokeWidth={1} opacity={0.6} />
      {/* Tower body */}
      <rect x={-26} y={-30} width={52} height={75} rx={4} fill={`${c}18`} stroke={c} strokeWidth={isSelected ? 2 : 1.2} />
      {/* Tower floors */}
      {[-10, 10, 30].map(y => (
        <rect key={y} x={-20} y={y} width={40} height={12} rx={2} fill={`${c}15`} stroke={c} strokeWidth={0.6} opacity={0.7} />
      ))}
      {/* Antenna */}
      <line x1={0} y1={-30} x2={0} y2={-52} stroke={c} strokeWidth={2} />
      <circle cx={0} cy={-54} r={4} fill={c} opacity={0.8}>
        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1.5s" repeatCount="indefinite" />
      </circle>
      {/* Icon */}
      <text x={0} y={6} textAnchor="middle" fontSize={16} fill={c} fontFamily="system-ui" opacity={0.9}>🏛️</text>
    </g>
  );
}

function RuntimeHub({ c }: { c: string }) {
  return (
    <g>
      {/* Reactor rings */}
      <circle cx={0} cy={0} r={55} fill="none" stroke={c} strokeWidth={1} opacity={0.15} />
      <circle cx={0} cy={0} r={42} fill="none" stroke={c} strokeWidth={1} opacity={0.25} strokeDasharray="6 4" />
      {/* Core */}
      <circle cx={0} cy={0} r={30} fill={`${c}20`} stroke={c} strokeWidth={1.5} />
      <circle cx={0} cy={0} r={18} fill={`${c}35`} />
      {/* Spoke connectors */}
      {[0, 72, 144, 216, 288].map(angle => {
        const rad = (angle * Math.PI) / 180;
        return (
          <g key={angle}>
            <line x1={Math.cos(rad) * 30} y1={Math.sin(rad) * 30}
                  x2={Math.cos(rad) * 55} y2={Math.sin(rad) * 55}
                  stroke={c} strokeWidth={1} opacity={0.4} />
            <circle cx={Math.cos(rad) * 55} cy={Math.sin(rad) * 55} r={4} fill={c} opacity={0.6} />
          </g>
        );
      })}
      <text x={0} y={6} textAnchor="middle" fontSize={16} fill={c} fontFamily="system-ui">⚡</text>
    </g>
  );
}

function AgentStation({ c, agentId }: { c: string; agentId: string }) {
  // Hexagon shape
  const R = 44;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const angle = ((i * 60 - 30) * Math.PI) / 180;
    return `${Math.cos(angle) * R},${Math.sin(angle) * R}`;
  }).join(" ");

  const icons: Record<string, string> = {
    abdi: "👑", dame: "🔧", ayub: "🏗️", ahmed: "🧬",
    atlas: "📡", rex: "🛡️", prime: "📈", sygma: "🏥",
    codex: "⚙️", claude: "✨",
  };
  const icon = icons[agentId] ?? "🤖";

  return (
    <g>
      {/* Hex base glow */}
      <polygon points={pts} fill={`${c}10`} stroke={c} strokeWidth={2} opacity={0.8} />
      {/* Inner hex */}
      {(() => {
        const r2 = R * 0.65;
        const p2 = Array.from({ length: 6 }, (_, i) => {
          const a = ((i * 60 - 30) * Math.PI) / 180;
          return `${Math.cos(a) * r2},${Math.sin(a) * r2}`;
        }).join(" ");
        return <polygon points={p2} fill={`${c}18`} />;
      })()}
      {/* Center circle */}
      <circle cx={0} cy={0} r={20} fill={`${c}30`} stroke={c} strokeWidth={1} />
      {/* Icon */}
      <text x={0} y={8} textAnchor="middle" fontSize={18} fontFamily="system-ui">{icon}</text>
      {/* Status dot — top right of hex */}
      <circle cx={R * 0.6} cy={-R * 0.6} r={5} fill="#22c55e" stroke="#020817" strokeWidth={1.5} />
    </g>
  );
}

function DatabaseVault({ c }: { c: string }) {
  return (
    <g>
      {/* Cylinder top */}
      <ellipse cx={0} cy={-28} rx={42} ry={10} fill={`${c}25`} stroke={c} strokeWidth={1.5} />
      {/* Cylinder body */}
      <rect x={-42} y={-28} width={84} height={56} fill={`${c}15`} stroke={c} strokeWidth={1} />
      {/* Cylinder bottom */}
      <ellipse cx={0} cy={28} rx={42} ry={10} fill={`${c}20`} stroke={c} strokeWidth={1.5} />
      {/* Stripe bands */}
      {[-10, 8].map(y => (
        <rect key={y} x={-42} y={y} width={84} height={4} fill={c} opacity={0.12} />
      ))}
      <text x={0} y={8} textAnchor="middle" fontSize={18} fill={c} fontFamily="system-ui" opacity={0.9}>🗄️</text>
    </g>
  );
}

function MemoryArchive({ c }: { c: string }) {
  return (
    <g>
      {/* Archive shelves */}
      {[-25, 0, 25].map(y => (
        <rect key={y} x={-40} y={y - 8} width={80} height={14} rx={3}
              fill={`${c}18`} stroke={c} strokeWidth={0.8} opacity={0.8} />
      ))}
      {/* Outer border */}
      <rect x={-44} y={-38} width={88} height={74} rx={5} fill="none" stroke={c} strokeWidth={1.5} opacity={0.6} />
      <text x={0} y={6} textAnchor="middle" fontSize={16} fontFamily="system-ui">🧮</text>
    </g>
  );
}

function MonitoringRadar({ c }: { c: string }) {
  return (
    <g>
      {/* Radar rings */}
      {[42, 30, 18].map(r => (
        <circle key={r} cx={0} cy={0} r={r} fill="none" stroke={c} strokeWidth={1} opacity={r === 42 ? 0.3 : 0.5} />
      ))}
      {/* Cross hairs */}
      <line x1={-44} y1={0} x2={44} y2={0} stroke={c} strokeWidth={0.8} opacity={0.3} />
      <line x1={0} y1={-44} x2={0} y2={44} stroke={c} strokeWidth={0.8} opacity={0.3} />
      {/* Sweep arm */}
      <line x1={0} y1={0} x2={40} y2={0} stroke={c} strokeWidth={2} opacity={0.7}>
        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="4s" repeatCount="indefinite" />
      </line>
      {/* Center */}
      <circle cx={0} cy={0} r={7} fill={c} opacity={0.8} />
      <text x={0} y={5} textAnchor="middle" fontSize={8} fill="#020817" fontFamily="monospace" fontWeight="bold">▲</text>
    </g>
  );
}

function DeploymentPad({ c }: { c: string }) {
  return (
    <g>
      {/* Launch pad base */}
      <ellipse cx={0} cy={30} rx={44} ry={9} fill={`${c}20`} stroke={c} strokeWidth={1} />
      {/* Pad support legs */}
      {[-28, 0, 28].map(x => (
        <rect key={x} x={x - 4} y={0} width={8} height={30} rx={2} fill={`${c}20`} stroke={c} strokeWidth={0.8} />
      ))}
      {/* Top platform */}
      <rect x={-40} y={-12} width={80} height={14} rx={3} fill={`${c}25`} stroke={c} strokeWidth={1.5} />
      {/* Signal indicator */}
      <circle cx={0} cy={-22} r={8} fill={`${c}30`} stroke={c} strokeWidth={1.5} />
      <text x={0} y={-18} textAnchor="middle" fontSize={12} fontFamily="system-ui">🚀</text>
    </g>
  );
}

function ServerTower({ c }: { c: string }) {
  return (
    <g>
      {/* Server rack body */}
      <rect x={-32} y={-42} width={64} height={84} rx={4} fill={`${c}18`} stroke={c} strokeWidth={1.5} />
      {/* Server unit slots */}
      {[-30, -14, 2, 18, 34].map(y => (
        <g key={y}>
          <rect x={-26} y={y} width={52} height={10} rx={2} fill={`${c}15`} stroke={c} strokeWidth={0.6} />
          <circle cx={20} cy={y + 5} r={2.5} fill={c} opacity={0.7}>
            <animate attributeName="opacity" values="0.7;0.3;0.7" dur={`${1.2 + y * 0.05}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </g>
  );
}

function WebsiteGate({ c }: { c: string }) {
  return (
    <g>
      {/* Gate arch */}
      <path d="M -50 30 L -50 -10 Q 0 -55 50 -10 L 50 30 Z"
            fill={`${c}15`} stroke={c} strokeWidth={1.5} />
      {/* Gateway opening */}
      <rect x={-18} y={-4} width={36} height={34} rx={3} fill={`${c}25`} stroke={c} strokeWidth={1} />
      {/* Banner flag */}
      <line x1={0} y1={-55} x2={0} y2={-35} stroke={c} strokeWidth={2} />
      <polygon points="0,-55 22,-48 0,-41" fill={c} opacity={0.7} />
      <text x={0} y={20} textAnchor="middle" fontSize={14} fontFamily="system-ui">🌐</text>
    </g>
  );
}

function PortalGate({ c, isPlanned }: { c: string; isPlanned: boolean }) {
  return (
    <g opacity={isPlanned ? 0.5 : 1}>
      {/* Gate pillars */}
      <rect x={-50} y={-30} width={16} height={60} rx={3} fill={`${c}18`} stroke={c} strokeWidth={isPlanned ? 1 : 1.5} strokeDasharray={isPlanned ? "5 3" : undefined} />
      <rect x={34} y={-30} width={16} height={60} rx={3} fill={`${c}18`} stroke={c} strokeWidth={isPlanned ? 1 : 1.5} strokeDasharray={isPlanned ? "5 3" : undefined} />
      {/* Gate top arch */}
      <path d="M -50 -30 Q 0 -70 50 -30" fill="none" stroke={c} strokeWidth={isPlanned ? 1 : 2} strokeDasharray={isPlanned ? "5 3" : undefined} />
      {/* Lock / keyhole */}
      <circle cx={0} cy={8} r={12} fill={`${c}25`} stroke={c} strokeWidth={1.2} />
      <text x={0} y={13} textAnchor="middle" fontSize={14} fontFamily="system-ui">🔐</text>
      {/* Blueprint ghost label */}
      {isPlanned && (
        <text x={0} y={48} textAnchor="middle" fontSize={8} fontWeight="700" letterSpacing="0.1em"
              fill={c} fontFamily="monospace" opacity={0.7}>PLANNED</text>
      )}
    </g>
  );
}

function RevenueTerminal({ c }: { c: string }) {
  return (
    <g>
      {/* Terminal base */}
      <rect x={-50} y={-10} width={100} height={48} rx={5} fill={`${c}20`} stroke={c} strokeWidth={1.5} />
      {/* Screen */}
      <rect x={-40} y={-28} width={80} height={22} rx={3} fill={`${c}30`} stroke={c} strokeWidth={1} />
      {/* Output arrows */}
      {[-20, 0, 20].map(x => (
        <polygon key={x} points={`${x},-5 ${x - 7},10 ${x + 7},10`} fill={c} opacity={0.5} />
      ))}
      <text x={0} y={28} textAnchor="middle" fontSize={14} fontFamily="system-ui">💰</text>
    </g>
  );
}

function ServiceOutpost({ c }: { c: string }) {
  return (
    <g>
      {/* Outpost building */}
      <rect x={-44} y={-28} width={88} height={56} rx={5} fill={`${c}15`} stroke={c} strokeWidth={1.2} />
      {/* Roof */}
      <polygon points="-50,-28 0,-52 50,-28" fill={`${c}22`} stroke={c} strokeWidth={1} />
      {/* Window */}
      <rect x={-12} y={-14} width={24} height={20} rx={2} fill={`${c}30`} stroke={c} strokeWidth={0.8} />
      {/* Door */}
      <rect x={-8} y={12} width={16} height={16} rx={2} fill={`${c}20`} stroke={c} strokeWidth={0.8} />
    </g>
  );
}

function WorkflowRail({ c }: { c: string }) {
  return (
    <g>
      {/* Rail tracks */}
      <line x1={-48} y1={-10} x2={48} y2={-10} stroke={c} strokeWidth={3} opacity={0.5} />
      <line x1={-48} y1={10} x2={48} y2={10} stroke={c} strokeWidth={3} opacity={0.5} />
      {/* Cross ties */}
      {[-36, -20, -4, 12, 28, 44].map(x => (
        <line key={x} x1={x - 2} y1={-16} x2={x - 2} y2={16} stroke={c} strokeWidth={4} opacity={0.3} />
      ))}
      {/* Moving packet */}
      <rect x={-12} y={-18} width={24} height={36} rx={4} fill={`${c}25`} stroke={c} strokeWidth={1} />
      <text x={0} y={6} textAnchor="middle" fontSize={14} fontFamily="system-ui">⚙️</text>
    </g>
  );
}

function ToolModule({ c }: { c: string }) {
  return (
    <g>
      {/* Module body */}
      <rect x={-32} y={-30} width={64} height={60} rx={4} fill={`${c}18`} stroke={c} strokeWidth={1.2} />
      {/* Connector ports top/bottom */}
      {[-10, 0, 10].map(x => (
        <g key={x}>
          <rect x={x - 4} y={-36} width={8} height={8} rx={1} fill={`${c}30`} stroke={c} strokeWidth={0.8} />
          <rect x={x - 4} y={28} width={8} height={8} rx={1} fill={`${c}30`} stroke={c} strokeWidth={0.8} />
        </g>
      ))}
      <text x={0} y={8} textAnchor="middle" fontSize={16} fontFamily="system-ui">🔩</text>
    </g>
  );
}

function SkillCrystal({ c }: { c: string }) {
  return (
    <g>
      {/* Diamond shape */}
      <polygon points="0,-34 30,0 0,34 -30,0" fill={`${c}22`} stroke={c} strokeWidth={1.5} />
      {/* Inner diamond */}
      <polygon points="0,-18 16,0 0,18 -16,0" fill={`${c}40`} />
      {/* Shine */}
      <line x1={-8} y1={-20} x2={-4} y2={-12} stroke="white" strokeWidth={1.5} opacity={0.4} />
      <text x={0} y={6} textAnchor="middle" fontSize={13} fontFamily="system-ui">💎</text>
    </g>
  );
}

function PlannedBlueprint({ c }: { c: string }) {
  return (
    <g opacity={0.55}>
      {/* Blueprint grid lines */}
      {[-24, -8, 8, 24].map(y => (
        <line key={y} x1={-46} y1={y} x2={46} y2={y} stroke={c} strokeWidth={0.5} opacity={0.4} />
      ))}
      {[-30, 0, 30].map(x => (
        <line key={x} x1={x} y1={-36} x2={x} y2={36} stroke={c} strokeWidth={0.5} opacity={0.4} />
      ))}
      {/* Dashed border */}
      <rect x={-46} y={-36} width={92} height={72} rx={5} fill={`${c}08`} stroke={c} strokeWidth={1.5} strokeDasharray="6 4" />
      {/* Blueprint label */}
      <text x={0} y={-14} textAnchor="middle" fontSize={16} fontFamily="system-ui" opacity={0.7}>📐</text>
      <text x={0} y={12} textAnchor="middle" fontSize={9} fontWeight="700" letterSpacing="0.1em"
            fill={c} fontFamily="monospace" opacity={0.8}>PLANNED</text>
    </g>
  );
}

// ── Landmark Node ─────────────────────────────────────────────────────────────
// Renders one node as an SVG landmark shape + name label.

export function LandmarkNode({
  node, isSelected, zoom, onClick,
}: {
  node: EcosystemNode;
  isSelected: boolean;
  zoom: number;
  onClick: () => void;
}) {
  const kind = getNodeKind(node.id, node);
  const size = KIND_SIZE[kind];
  const pos = getPos(node.id);
  const c = node.color;
  const hw = size.w / 2;
  const hh = size.h / 2;

  // Name label visibility
  const showLabel = zoom > 0.12;
  const showSubLabel = zoom > 0.45;

  // Selected ring
  const selectedRingR = Math.max(hw, hh) + 12;

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Selection ring */}
      {isSelected && (
        <circle cx={0} cy={0} r={selectedRingR} fill="none" stroke={c} strokeWidth={2} opacity={0.5} strokeDasharray="6 4">
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="8s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Shape */}
      {kind === "brain_core"       && <BrainCore c={c} pulse />}
      {kind === "command_tower"    && <CommandTower c={c} isSelected={isSelected} />}
      {kind === "runtime_hub"      && <RuntimeHub c={c} />}
      {kind === "agent_station"    && <AgentStation c={c} agentId={node.id.replace("agents.", "")} />}
      {kind === "database_vault"   && <DatabaseVault c={c} />}
      {kind === "memory_archive"   && <MemoryArchive c={c} />}
      {kind === "monitoring_radar" && <MonitoringRadar c={c} />}
      {kind === "deployment_pad"   && <DeploymentPad c={c} />}
      {kind === "server_tower"     && <ServerTower c={c} />}
      {kind === "website_gate"     && <WebsiteGate c={c} />}
      {kind === "portal_gate"      && <PortalGate c={c} isPlanned={false} />}
      {kind === "planned_blueprint"&& <PlannedBlueprint c={c} />}
      {kind === "revenue_terminal" && <RevenueTerminal c={c} />}
      {kind === "service_outpost"  && <ServiceOutpost c={c} />}
      {kind === "workflow_rail"    && <WorkflowRail c={c} />}
      {kind === "tool_module"      && <ToolModule c={c} />}
      {kind === "skill_crystal"    && <SkillCrystal c={c} />}

      {/* Name label — below shape */}
      {showLabel && (
        <g transform={`translate(0, ${hh + 18})`}>
          <rect x={-70} y={-9} width={140} height={16} rx={4} fill="#020817" opacity={0.85} />
          <text
            x={0} y={4}
            textAnchor="middle"
            fill={isSelected ? c : "#cbd5e1"}
            fontSize={10}
            fontWeight={isSelected ? "700" : "600"}
            fontFamily="system-ui, -apple-system, sans-serif"
            opacity={isSelected ? 1 : 0.9}
          >
            {node.name}
          </text>
        </g>
      )}

      {/* Owner agent dot — shown at medium zoom */}
      {showSubLabel && node.ownerAgent && (
        <g transform={`translate(0, ${hh + 34})`}>
          <circle cx={-30} cy={0} r={4} fill={agentColor(node.ownerAgent)} />
          <text x={-22} y={4} fill={agentColor(node.ownerAgent)} fontSize={8} fontFamily="monospace" opacity={0.8}>
            {node.ownerAgent}
          </text>
        </g>
      )}

      {/* Status pulse — healthy nodes get a tiny living dot */}
      {node.status === "healthy" && (
        <circle cx={hw - 4} cy={-hh + 4} r={4} fill="#22c55e">
          <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

// ── Region Terrain ────────────────────────────────────────────────────────────
// Replaces ZoneBand. Renders a glowing terrain region with dot-grid background.

export function RegionTerrain({
  zone, zoom, totalWidth,
}: {
  zone: typeof LAYER_ZONES[number];
  zoom: number;
  totalWidth: number;
}) {
  const isCortex = zone.layer === 5;
  const isC2 = zone.layer === 4;
  const isAgents = zone.layer === 7;
  const pad = 120;
  const x = -totalWidth / 2 - pad;
  const w = totalWidth + pad * 2;
  const y = zone.yOffset;
  const h = zone.height;
  const midX = 0;
  const midY = y + h / 2;

  // Region glow radius scales with importance
  const glowR = isCortex ? 900 : isC2 ? 700 : 500;
  const glowOpacity = isCortex ? 0.07 : isC2 ? 0.05 : 0.04;

  // Show region name: always (at far zoom it's large text = readable; at close zoom it's tiny = unobtrusive)
  const labelSize = zoom < 0.15 ? Math.round(10 / zoom) : zoom < 0.35 ? 28 : 18;

  return (
    <g>
      {/* Region glow — radial gradient centered on the zone */}
      <defs>
        <radialGradient id={`rg-${zone.layer}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={zone.color} stopOpacity={glowOpacity * 2} />
          <stop offset="60%" stopColor={zone.color} stopOpacity={glowOpacity} />
          <stop offset="100%" stopColor={zone.color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={midX} cy={midY} rx={glowR} ry={h * 0.7}
               fill={`url(#rg-${zone.layer})`} />

      {/* Region border box */}
      <rect
        x={x} y={y} width={w} height={h} rx={20}
        fill="none"
        stroke={zone.color}
        strokeWidth={isCortex ? 1.5 : 1}
        opacity={isCortex ? 0.35 : isC2 ? 0.3 : 0.18}
      />

      {/* Cortex extra glow ring */}
      {isCortex && (
        <rect x={x - 8} y={y - 8} width={w + 16} height={h + 16} rx={26}
              fill="none" stroke={zone.color} strokeWidth={1} opacity={0.12}
              strokeDasharray="12 6" />
      )}

      {/* Region label — left side, vertically centered */}
      <g transform={`translate(${x + 28}, ${midY})`}>
        <text
          x={0} y={0}
          textAnchor="start"
          dominantBaseline="middle"
          fill={zone.color}
          fontSize={labelSize}
          fontWeight="700"
          letterSpacing="0.06em"
          textTransform="uppercase"
          fontFamily="system-ui, -apple-system"
          opacity={isCortex ? 0.6 : 0.35}
          style={{ textTransform: "uppercase" }}
        >
          {zone.name.toUpperCase()}
        </text>
      </g>

      {/* Layer number badge — small, upper left corner */}
      {zoom > 0.08 && (
        <g transform={`translate(${x + 12}, ${y + 14})`}>
          <rect x={0} y={-9} width={24} height={16} rx={3} fill={`${zone.color}22`} stroke={`${zone.color}55`} strokeWidth={0.8} />
          <text x={12} y={4} textAnchor="middle" fill={zone.color} fontSize={9} fontWeight="700" fontFamily="monospace" opacity={0.8}>
            L{zone.layer}
          </text>
        </g>
      )}
    </g>
  );
}

// ── World Background ──────────────────────────────────────────────────────────
// Dot grid rendered as SVG pattern. Covers entire canvas.

export function WorldBackground({ width, height }: { width: number; height: number }) {
  return (
    <svg
      style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none", zIndex: 0 }}
      width={width} height={height}
    >
      <defs>
        <pattern id="dot-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="1" fill="#1e293b" opacity="0.6" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#dot-grid)" />
    </svg>
  );
}
