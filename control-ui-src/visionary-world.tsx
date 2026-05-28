// visionary-world.tsx — Orbital universe visual renderer.
// All shapes render centered at (0,0) in world-space with SVG transforms.

import React from "react";
import { getPos, RING_RADII, UNIVERSE_RADIUS } from "./visionary-layout";
import { ORBIT_RINGS } from "./visionary-connections";
import { agentColor } from "./agent-constants";
import type { EcosystemNode } from "./visionary-types";

// ── Visual node kind ──────────────────────────────────────────────────────────

export type VisualNodeKind =
  | "brain_core" | "command_tower" | "runtime_hub" | "agent_station"
  | "tool_module" | "skill_crystal" | "workflow_rail" | "database_vault"
  | "memory_archive" | "monitoring_radar" | "deployment_pad" | "server_tower"
  | "website_gate" | "portal_gate" | "revenue_terminal" | "service_outpost"
  | "planned_blueprint";

const KIND_MAP: Record<string, VisualNodeKind> = {
  "biz.tech-rescue": "service_outpost", "biz.sygma-house": "service_outpost",
  "biz.ai-packages": "service_outpost", "biz.trading": "tool_module",
  "public.site": "website_gate", "public.services": "website_gate",
  "public.lead-capture": "workflow_rail", "public.cloudflare": "monitoring_radar",
  "portal.auth": "planned_blueprint", "portal.billing": "planned_blueprint",
  "portal.dashboard": "planned_blueprint",
  "c2.runtime": "command_tower", "c2.redis": "database_vault",
  "c2.voice": "tool_module", "c2.projects": "tool_module",
  "c2.memory-tab": "memory_archive", "c2.visionary": "tool_module",
  "cortex.core": "brain_core", "cortex.registry": "memory_archive",
  "cortex.memory": "memory_archive",
  "skills.codex-lib": "skill_crystal", "skills.memory": "skill_crystal",
  "skills.brainstorming": "skill_crystal", "skills.debugging": "skill_crystal",
  "skills.writing-plans": "skill_crystal", "skills.mcp-builder": "skill_crystal",
  "skills.superpowers": "skill_crystal", "skills.frontend-design": "skill_crystal",
  "mcp.server": "runtime_hub", "mcp.openclaw": "runtime_hub",
  "mcp.openrouter": "tool_module", "mcp.relay": "tool_module",
  "agents.abdi": "agent_station", "agents.dame": "agent_station",
  "agents.ayub": "agent_station", "agents.ahmed": "agent_station",
  "agents.atlas": "agent_station", "agents.rex": "agent_station",
  "agents.prime": "agent_station", "agents.sygma": "agent_station",
  "agents.codex": "agent_station", "agents.claude": "agent_station",
  "auto.n8n": "workflow_rail", "auto.leads": "workflow_rail",
  "auto.scheduled": "workflow_rail", "auto.crm": "planned_blueprint",
  "auto.email": "planned_blueprint", "auto.postgres": "database_vault",
  "data.supabase": "database_vault", "data.claude-memory": "memory_archive",
  "data.notion": "memory_archive", "data.gdrive": "memory_archive",
  "data.graphify": "tool_module",
  "vps.docker": "server_tower", "vps.caddy": "server_tower",
  "vps.cloudflared": "server_tower", "vps.github": "deployment_pad",
  "vps.vercel": "deployment_pad",
  "mon.kuma": "monitoring_radar", "mon.logs": "monitoring_radar",
  "biz.revenue": "revenue_terminal",
};

export function getNodeKind(id: string, node: EcosystemNode): VisualNodeKind {
  if (node.status === "planned") return "planned_blueprint";
  return KIND_MAP[id] ?? "service_outpost";
}

// Size by kind
export const KIND_SIZE: Record<VisualNodeKind, { w: number; h: number }> = {
  brain_core: { w: 220, h: 220 }, command_tower: { w: 110, h: 120 },
  runtime_hub: { w: 110, h: 110 }, agent_station: { w: 90, h: 90 },
  database_vault: { w: 90, h: 80 }, memory_archive: { w: 90, h: 72 },
  monitoring_radar: { w: 80, h: 80 }, deployment_pad: { w: 80, h: 72 },
  server_tower: { w: 72, h: 80 }, website_gate: { w: 100, h: 80 },
  portal_gate: { w: 90, h: 80 }, service_outpost: { w: 90, h: 72 },
  revenue_terminal: { w: 100, h: 80 }, workflow_rail: { w: 88, h: 64 },
  tool_module: { w: 72, h: 64 }, skill_crystal: { w: 60, h: 60 },
  planned_blueprint: { w: 90, h: 72 },
};

// ── Agent icons ───────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, string> = {
  abdi: "👑", dame: "🔧", ayub: "🏗️", ahmed: "🧬",
  atlas: "📡", rex: "🛡️", prime: "📈", sygma: "🏥",
  codex: "⚙️", claude: "✨",
};

// ── SVG Shape Components ──────────────────────────────────────────────────────

function BrainCore({ c }: { c: string }) {
  return (
    <g>
      {[160, 120, 88, 62].map((r, i) => (
        <circle key={r} cx={0} cy={0} r={r} fill="none" stroke={c}
          strokeWidth={i === 0 ? 0.8 : i === 1 ? 1 : 1.5}
          opacity={[0.08, 0.14, 0.22, 0.35][i]}>
          {i === 1 && <animate attributeName="r" values={`${r - 4};${r + 4};${r - 4}`} dur="4s" repeatCount="indefinite" />}
        </circle>
      ))}
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
        const rad = a * Math.PI / 180;
        return <line key={a} x1={0} y1={0} x2={Math.cos(rad) * 60} y2={Math.sin(rad) * 60}
          stroke={c} strokeWidth={0.8} opacity={0.18} />;
      })}
      <circle cx={0} cy={0} r={42} fill={`${c}22`} stroke={c} strokeWidth={2} />
      <circle cx={0} cy={0} r={26} fill={`${c}40`} />
      <circle cx={0} cy={0} r={12} fill={c} opacity={0.9}>
        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <text x={0} y={7} textAnchor="middle" fontSize={16} fill="#020817">🧠</text>
    </g>
  );
}

function CommandTower({ c, sel }: { c: string; sel: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={42} rx={44} ry={9} fill={`${c}20`} stroke={c} strokeWidth={0.8} opacity={0.5} />
      <rect x={-22} y={-32} width={44} height={74} rx={4} fill={`${c}18`} stroke={c} strokeWidth={sel ? 2 : 1.2} />
      {[-14, 4, 22].map(y => (
        <rect key={y} x={-16} y={y} width={32} height={11} rx={2} fill={`${c}18`} stroke={c} strokeWidth={0.6} opacity={0.7} />
      ))}
      <line x1={0} y1={-32} x2={0} y2={-50} stroke={c} strokeWidth={2} />
      <circle cx={0} cy={-52} r={4} fill={c} opacity={0.8}>
        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <text x={0} y={5} textAnchor="middle" fontSize={14} fill={c}>🏛️</text>
    </g>
  );
}

function RuntimeHub({ c }: { c: string }) {
  const spokes = [0, 72, 144, 216, 288];
  return (
    <g>
      <circle cx={0} cy={0} r={50} fill="none" stroke={c} strokeWidth={1} opacity={0.14} />
      <circle cx={0} cy={0} r={38} fill="none" stroke={c} strokeWidth={1} opacity={0.22} strokeDasharray="5 4" />
      <circle cx={0} cy={0} r={26} fill={`${c}20`} stroke={c} strokeWidth={1.5} />
      <circle cx={0} cy={0} r={15} fill={`${c}38`} />
      {spokes.map(a => {
        const rad = a * Math.PI / 180;
        return (
          <g key={a}>
            <line x1={Math.cos(rad) * 26} y1={Math.sin(rad) * 26}
                  x2={Math.cos(rad) * 50} y2={Math.sin(rad) * 50}
                  stroke={c} strokeWidth={1} opacity={0.4} />
            <circle cx={Math.cos(rad) * 50} cy={Math.sin(rad) * 50} r={3.5} fill={c} opacity={0.6} />
          </g>
        );
      })}
      <text x={0} y={5} textAnchor="middle" fontSize={14} fill={c}>⚡</text>
    </g>
  );
}

function AgentStation({ c, agentId }: { c: string; agentId: string }) {
  const R = 40;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 - 30) * Math.PI) / 180;
    return `${Math.cos(a) * R},${Math.sin(a) * R}`;
  }).join(" ");
  const r2 = R * 0.62;
  const pts2 = Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 - 30) * Math.PI) / 180;
    return `${Math.cos(a) * r2},${Math.sin(a) * r2}`;
  }).join(" ");
  return (
    <g>
      <polygon points={pts} fill={`${c}12`} stroke={c} strokeWidth={1.8} />
      <polygon points={pts2} fill={`${c}20`} />
      <circle cx={0} cy={0} r={17} fill={`${c}30`} stroke={c} strokeWidth={0.8} />
      <text x={0} y={7} textAnchor="middle" fontSize={16}>{AGENT_ICONS[agentId] ?? "🤖"}</text>
      <circle cx={R * 0.58} cy={-R * 0.58} r={5} fill="#22c55e" stroke="#020817" strokeWidth={1.5} />
    </g>
  );
}

function DatabaseVault({ c }: { c: string }) {
  return (
    <g>
      <ellipse cx={0} cy={-24} rx={38} ry={9} fill={`${c}28`} stroke={c} strokeWidth={1.4} />
      <rect x={-38} y={-24} width={76} height={48} fill={`${c}15`} stroke={c} strokeWidth={1} />
      <ellipse cx={0} cy={24} rx={38} ry={9} fill={`${c}20`} stroke={c} strokeWidth={1.4} />
      {[-8, 8].map(y => <rect key={y} x={-38} y={y} width={76} height={3} fill={c} opacity={0.1} />)}
      <text x={0} y={7} textAnchor="middle" fontSize={16} fill={c} opacity={0.9}>🗄️</text>
    </g>
  );
}

function MemoryArchive({ c }: { c: string }) {
  return (
    <g>
      {[-20, 0, 20].map(y => (
        <rect key={y} x={-36} y={y - 7} width={72} height={12} rx={3}
          fill={`${c}18`} stroke={c} strokeWidth={0.8} opacity={0.8} />
      ))}
      <rect x={-40} y={-32} width={80} height={62} rx={5} fill="none" stroke={c} strokeWidth={1.4} opacity={0.6} />
      <text x={0} y={5} textAnchor="middle" fontSize={14}>🧮</text>
    </g>
  );
}

function MonitoringRadar({ c }: { c: string }) {
  return (
    <g>
      {[38, 27, 16].map(r => (
        <circle key={r} cx={0} cy={0} r={r} fill="none" stroke={c} strokeWidth={1}
          opacity={r === 38 ? 0.3 : 0.5} />
      ))}
      <line x1={-40} y1={0} x2={40} y2={0} stroke={c} strokeWidth={0.7} opacity={0.25} />
      <line x1={0} y1={-40} x2={0} y2={40} stroke={c} strokeWidth={0.7} opacity={0.25} />
      <line x1={0} y1={0} x2={38} y2={0} stroke={c} strokeWidth={2} opacity={0.75}>
        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="3.5s" repeatCount="indefinite" />
      </line>
      <circle cx={0} cy={0} r={6} fill={c} opacity={0.85} />
    </g>
  );
}

function DeploymentPad({ c }: { c: string }) {
  return (
    <g>
      <ellipse cx={0} cy={26} rx={38} ry={8} fill={`${c}20`} stroke={c} strokeWidth={1} />
      {[-24, 0, 24].map(x => (
        <rect key={x} x={x - 3} y={0} width={6} height={26} rx={2} fill={`${c}20`} stroke={c} strokeWidth={0.7} />
      ))}
      <rect x={-34} y={-10} width={68} height={12} rx={3} fill={`${c}28`} stroke={c} strokeWidth={1.4} />
      <text x={0} y={-18} textAnchor="middle" fontSize={14}>🚀</text>
    </g>
  );
}

function ServerTower({ c }: { c: string }) {
  return (
    <g>
      <rect x={-28} y={-38} width={56} height={76} rx={4} fill={`${c}18`} stroke={c} strokeWidth={1.4} />
      {[-26, -12, 2, 16, 30].map(y => (
        <g key={y}>
          <rect x={-22} y={y} width={44} height={9} rx={2} fill={`${c}14`} stroke={c} strokeWidth={0.5} />
          <circle cx={17} cy={y + 4.5} r={2.2} fill={c} opacity={0.6}>
            <animate attributeName="opacity" values="0.6;0.2;0.6" dur={`${1.5 + y * 0.04}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </g>
  );
}

function WebsiteGate({ c }: { c: string }) {
  return (
    <g>
      <path d="M -44 28 L -44 -8 Q 0 -50 44 -8 L 44 28 Z" fill={`${c}15`} stroke={c} strokeWidth={1.4} />
      <rect x={-16} y={-2} width={32} height={30} rx={3} fill={`${c}25`} stroke={c} strokeWidth={1} />
      <line x1={0} y1={-50} x2={0} y2={-32} stroke={c} strokeWidth={2} />
      <polygon points="0,-50 20,-43 0,-36" fill={c} opacity={0.7} />
      <text x={0} y={18} textAnchor="middle" fontSize={12}>🌐</text>
    </g>
  );
}

function PlannedBlueprint({ c }: { c: string }) {
  return (
    <g opacity={0.5}>
      {[-20, -4, 12].map(y => (
        <line key={y} x1={-42} y1={y} x2={42} y2={y} stroke={c} strokeWidth={0.5} opacity={0.4} />
      ))}
      {[-28, 0, 28].map(x => (
        <line key={x} x1={x} y1={-32} x2={x} y2={32} stroke={c} strokeWidth={0.5} opacity={0.4} />
      ))}
      <rect x={-42} y={-32} width={84} height={64} rx={5} fill={`${c}08`} stroke={c} strokeWidth={1.4} strokeDasharray="6 4" />
      <text x={0} y={-8} textAnchor="middle" fontSize={14} opacity={0.7}>📐</text>
      <text x={0} y={14} textAnchor="middle" fontSize={8} fontWeight="700" letterSpacing="0.08em"
        fill={c} fontFamily="monospace" opacity={0.8}>PLANNED</text>
    </g>
  );
}

function RevenueTerminal({ c }: { c: string }) {
  return (
    <g>
      <rect x={-44} y={-8} width={88} height={42} rx={5} fill={`${c}20`} stroke={c} strokeWidth={1.4} />
      <rect x={-36} y={-24} width={72} height={18} rx={3} fill={`${c}30`} stroke={c} strokeWidth={1} />
      {[-16, 0, 16].map(x => (
        <polygon key={x} points={`${x},-3 ${x - 6},8 ${x + 6},8`} fill={c} opacity={0.45} />
      ))}
      <text x={0} y={26} textAnchor="middle" fontSize={13}>💰</text>
    </g>
  );
}

function ServiceOutpost({ c }: { c: string }) {
  return (
    <g>
      <rect x={-38} y={-22} width={76} height={50} rx={5} fill={`${c}15`} stroke={c} strokeWidth={1.2} />
      <polygon points="-44,-22 0,-48 44,-22" fill={`${c}22`} stroke={c} strokeWidth={1} />
      <rect x={-10} y={-12} width={20} height={18} rx={2} fill={`${c}30`} stroke={c} strokeWidth={0.7} />
      <rect x={-7} y={10} width={14} height={14} rx={2} fill={`${c}20`} stroke={c} strokeWidth={0.7} />
    </g>
  );
}

function WorkflowRail({ c }: { c: string }) {
  return (
    <g>
      <line x1={-42} y1={-8} x2={42} y2={-8} stroke={c} strokeWidth={3} opacity={0.5} />
      <line x1={-42} y1={8} x2={42} y2={8} stroke={c} strokeWidth={3} opacity={0.5} />
      {[-32, -16, 0, 16, 32].map(x => (
        <line key={x} x1={x} y1={-14} x2={x} y2={14} stroke={c} strokeWidth={4} opacity={0.25} />
      ))}
      <rect x={-10} y={-16} width={20} height={32} rx={3} fill={`${c}25`} stroke={c} strokeWidth={1} />
      <text x={0} y={5} textAnchor="middle" fontSize={13}>⚙️</text>
    </g>
  );
}

function ToolModule({ c }: { c: string }) {
  return (
    <g>
      <rect x={-28} y={-26} width={56} height={52} rx={4} fill={`${c}18`} stroke={c} strokeWidth={1.2} />
      {[-8, 0, 8].map(x => (
        <g key={x}>
          <rect x={x - 3.5} y={-32} width={7} height={7} rx={1} fill={`${c}30`} stroke={c} strokeWidth={0.7} />
          <rect x={x - 3.5} y={25} width={7} height={7} rx={1} fill={`${c}30`} stroke={c} strokeWidth={0.7} />
        </g>
      ))}
      <text x={0} y={6} textAnchor="middle" fontSize={14}>🔩</text>
    </g>
  );
}

function SkillCrystal({ c }: { c: string }) {
  return (
    <g>
      <polygon points="0,-30 26,0 0,30 -26,0" fill={`${c}22`} stroke={c} strokeWidth={1.4} />
      <polygon points="0,-14 12,0 0,14 -12,0" fill={`${c}42`} />
      <line x1={-7} y1={-17} x2={-4} y2={-10} stroke="white" strokeWidth={1.4} opacity={0.35} />
      <text x={0} y={5} textAnchor="middle" fontSize={12}>💎</text>
    </g>
  );
}

// ── Landmark Node ─────────────────────────────────────────────────────────────

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
  const ringR = Math.max(size.w, size.h) / 2 + 12;
  const showLabel = zoom > 0.06;
  const showOwner = zoom > 0.3;

  return (
    <g transform={`translate(${pos.x}, ${pos.y})`} onClick={onClick} style={{ cursor: "pointer" }}>
      {isSelected && (
        <circle cx={0} cy={0} r={ringR} fill="none" stroke={c} strokeWidth={2} opacity={0.55} strokeDasharray="6 4">
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="8s" repeatCount="indefinite" />
        </circle>
      )}

      {kind === "brain_core"        && <BrainCore c={c} />}
      {kind === "command_tower"     && <CommandTower c={c} sel={isSelected} />}
      {kind === "runtime_hub"       && <RuntimeHub c={c} />}
      {kind === "agent_station"     && <AgentStation c={c} agentId={node.id.replace("agents.", "")} />}
      {kind === "database_vault"    && <DatabaseVault c={c} />}
      {kind === "memory_archive"    && <MemoryArchive c={c} />}
      {kind === "monitoring_radar"  && <MonitoringRadar c={c} />}
      {kind === "deployment_pad"    && <DeploymentPad c={c} />}
      {kind === "server_tower"      && <ServerTower c={c} />}
      {kind === "website_gate"      && <WebsiteGate c={c} />}
      {kind === "planned_blueprint" && <PlannedBlueprint c={c} />}
      {kind === "revenue_terminal"  && <RevenueTerminal c={c} />}
      {kind === "service_outpost"   && <ServiceOutpost c={c} />}
      {kind === "workflow_rail"     && <WorkflowRail c={c} />}
      {kind === "tool_module"       && <ToolModule c={c} />}
      {kind === "skill_crystal"     && <SkillCrystal c={c} />}
      {kind === "portal_gate"       && <PlannedBlueprint c={c} />}

      {showLabel && (
        <g transform={`translate(0, ${size.h / 2 + 16})`}>
          <rect x={-58} y={-9} width={116} height={16} rx={4} fill="#020817" opacity={0.88} />
          <text x={0} y={4} textAnchor="middle"
            fill={isSelected ? c : "#cbd5e1"}
            fontSize={9} fontWeight={isSelected ? "700" : "600"}
            fontFamily="system-ui, -apple-system, sans-serif">
            {node.name}
          </text>
        </g>
      )}

      {showOwner && node.ownerAgent && (
        <g transform={`translate(0, ${size.h / 2 + 32})`}>
          <circle cx={-24} cy={0} r={3.5} fill={agentColor(node.ownerAgent)} />
          <text x={-18} y={4} fill={agentColor(node.ownerAgent)} fontSize={8} fontFamily="monospace" opacity={0.8}>
            {node.ownerAgent}
          </text>
        </g>
      )}

      {node.status === "healthy" && (
        <circle cx={size.w / 2 - 3} cy={-size.h / 2 + 3} r={3.5} fill="#22c55e">
          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

// ── Orbital Ring Bands ────────────────────────────────────────────────────────
// Renders concentric ring circles with glow + subtle label

export function OrbitalRings({ zoom }: { zoom: number }) {
  return (
    <g pointerEvents="none">
      <defs>
        {ORBIT_RINGS.map(ring => ring.radius > 0 && (
          <radialGradient key={ring.id} id={`rg-${ring.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="88%" stopColor={ring.color} stopOpacity={0} />
            <stop offset="96%" stopColor={ring.color} stopOpacity={ring.id === "core" ? 0.12 : 0.06} />
            <stop offset="100%" stopColor={ring.color} stopOpacity={0} />
          </radialGradient>
        ))}
        {/* Core glow */}
        <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.12} />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
        </radialGradient>
        {/* Perimeter glow */}
        <radialGradient id="perimeter-glow" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="#22c55e" stopOpacity={0} />
          <stop offset="95%" stopColor="#22c55e" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Core area glow */}
      <circle cx={0} cy={0} r={200} fill="url(#core-glow)" />

      {/* Ring circles */}
      {ORBIT_RINGS.filter(r => r.radius > 0).map(ring => (
        <g key={ring.id}>
          {/* Glow band (filled annular suggestion) */}
          <circle cx={0} cy={0} r={ring.radius + ring.width / 2}
            fill={`url(#rg-${ring.id})`} />
          {/* Ring line */}
          <circle cx={0} cy={0} r={ring.radius}
            fill="none" stroke={ring.color}
            strokeWidth={ring.id === "perimeter" ? 1.5 : 0.8}
            opacity={ring.id === "perimeter" ? 0.35 : 0.15}
            strokeDasharray={ring.id === "perimeter" ? "12 6" : undefined} />
          {/* Ring label — north top of each ring, only at lower zoom */}
          {zoom < 0.25 && zoom > 0.03 && (
            <g transform={`translate(0, -${ring.radius})`}>
              <rect x={-52} y={-10} width={104} height={16} rx={4} fill="#020817" opacity={0.88} />
              <text x={0} y={4} textAnchor="middle" fill={ring.color}
                fontSize={11} fontWeight="700" letterSpacing="0.06em"
                fontFamily="system-ui" opacity={0.7}>
                {ring.label.toUpperCase()}
              </text>
            </g>
          )}
        </g>
      ))}

      {/* Perimeter shield outer ring */}
      <circle cx={0} cy={0} r={UNIVERSE_RADIUS - 60}
        fill="none" stroke="#22c55e" strokeWidth={2} opacity={0.08}
        strokeDasharray="20 8" />
      <circle cx={0} cy={0} r={UNIVERSE_RADIUS - 20}
        fill="none" stroke="#22c55e" strokeWidth={1} opacity={0.04} />
    </g>
  );
}

// ── Starfield background ──────────────────────────────────────────────────────

export function Starfield({ radius }: { radius: number }) {
  // Deterministic star positions using a simple LCG
  const stars: Array<{ x: number; y: number; r: number; o: number }> = [];
  let seed = 42;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
  for (let i = 0; i < 280; i++) {
    const angle = lcg() * Math.PI * 2;
    const dist = lcg() * radius;
    stars.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      r: lcg() * 1.2 + 0.3,
      o: lcg() * 0.5 + 0.15,
    });
  }
  return (
    <g pointerEvents="none">
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#94a3b8" opacity={s.o} />
      ))}
    </g>
  );
}

// ── World background (dot grid) ───────────────────────────────────────────────
export function WorldBackground({ size }: { size: number }) {
  return (
    <svg style={{ position: "absolute", left: -size / 2, top: -size / 2, width: size, height: size, pointerEvents: "none", zIndex: 0 }}
      width={size} height={size}>
      <defs>
        <pattern id="dot-grid" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
          <circle cx="30" cy="30" r="0.8" fill="#1e293b" opacity="0.7" />
        </pattern>
      </defs>
      <rect width={size} height={size} fill="url(#dot-grid)" />
    </svg>
  );
}
