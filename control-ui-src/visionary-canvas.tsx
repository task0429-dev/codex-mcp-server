import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REGISTRY, REGISTRY_MAP } from "./visionary-registry";
import { NAMED_FLOWS, CROSS_EDGES, LAYER_ZONES, TOTAL_CANVAS_HEIGHT, CANVAS_WIDTH, LEFT_CORRIDOR_X, RIGHT_CORRIDOR_X } from "./visionary-connections";
import { LAYOUT, getPos, corridorPath, directEdgePath } from "./visionary-layout";
import { InspectorPanel, GapsOverlay, SystemExplorer } from "./visionary-inspector";
import { AgentAvatar, agentColor, AGENT_ORDER } from "./agent-constants";
import { LandmarkNode, RegionTerrain, WorldBackground } from "./visionary-world";
import type { EcosystemNode, CameraState } from "./visionary-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// SVG canvas bounds — wide enough to include corridors
const SVG_LEFT = LEFT_CORRIDOR_X - 140;
const SVG_WIDTH = (RIGHT_CORRIDOR_X - LEFT_CORRIDOR_X) + 280;

// ── SVG World Canvas ──────────────────────────────────────────────────────────
// Single SVG element covering the entire world. Contains:
//  1. RegionTerrain bands (glow + border + label)
//  2. RouteLayer (cross-edges + named flows)
//  3. LandmarkNodes (shaped buildings)

function WorldSVG({
  zoom,
  selectedId,
  onSelectNode,
}: {
  zoom: number;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <svg
      style={{
        position: "absolute",
        left: SVG_LEFT,
        top: 0,
        width: SVG_WIDTH,
        height: TOTAL_CANVAS_HEIGHT,
        overflow: "visible",
        pointerEvents: "none",
      }}
      viewBox={`${SVG_LEFT} 0 ${SVG_WIDTH} ${TOTAL_CANVAS_HEIGHT}`}
    >
      <defs>
        {/* Route glow filters */}
        <filter id="glow-route" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-mem" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-region" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="20" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {NAMED_FLOWS.map(f => (
          <marker key={f.id} id={`arrow-${f.id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={f.color} opacity="0.8" />
          </marker>
        ))}
      </defs>

      {/* ── 1. Region terrain bands ── */}
      <g style={{ pointerEvents: "none" }}>
        {LAYER_ZONES.map(zone => (
          <RegionTerrain
            key={zone.layer}
            zone={zone}
            zoom={zoom}
            totalWidth={SVG_WIDTH - 240}
          />
        ))}
      </g>

      {/* ── 2. Cross-layer edges ── */}
      <g style={{ pointerEvents: "none" }} opacity={zoom < 0.12 ? 0 : 1}>
        {CROSS_EDGES.map((edge, i) => {
          const path = directEdgePath(edge.from, edge.to);
          if (!path) return null;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={edge.color ?? "#3b82f622"}
              strokeWidth={1}
            />
          );
        })}
      </g>

      {/* ── 3. Named flow corridor routes ── */}
      <g style={{ pointerEvents: "none" }}>
        {NAMED_FLOWS.map(flow => {
          const cx = flow.corridor === "left" ? LEFT_CORRIDOR_X : RIGHT_CORRIDOR_X;
          const steps = flow.steps.filter(id => LAYOUT.has(id));
          if (steps.length < 2) return null;

          const paths: React.ReactNode[] = [];
          for (let i = 0; i < steps.length - 1; i++) {
            const p = corridorPath(steps[i], steps[i + 1], cx);
            if (!p) continue;
            const fromPos = getPos(steps[i]);
            const toPos = getPos(steps[i + 1]);
            const midY = (fromPos.y + toPos.y) / 2;

            paths.push(
              <g key={`${flow.id}-${i}`}>
                <path d={p} fill="none" stroke={flow.color} strokeWidth={6} opacity={0.05} filter="url(#glow-route)" />
                <path
                  d={p}
                  fill="none"
                  stroke={flow.color}
                  strokeWidth={2}
                  opacity={0.6}
                  strokeDasharray={flow.id === "memory-loop" ? "6 5" : undefined}
                  markerEnd={i === steps.length - 2 ? `url(#arrow-${flow.id})` : undefined}
                />
                {zoom > 0.1 && i === 0 && (
                  <g transform={`translate(${cx}, ${midY})`}>
                    <rect x={-40} y={-10} width={80} height={18} rx={5} fill="#020817" opacity={0.95} />
                    <rect x={-40} y={-10} width={80} height={18} rx={5} fill="none" stroke={flow.color} strokeWidth={0.8} opacity={0.4} />
                    <text
                      x={0} y={5}
                      textAnchor="middle"
                      fill={flow.color}
                      fontSize={8}
                      fontWeight="700"
                      letterSpacing="0.07em"
                      fontFamily="monospace"
                    >
                      {flow.label}
                    </text>
                  </g>
                )}
              </g>
            );
          }
          return <g key={flow.id}>{paths}</g>;
        })}

        {/* Memory loop neural return path */}
        {(() => {
          const dataPos = getPos("data.claude-memory");
          const cortexPos = getPos("cortex.core");
          if (!dataPos || !cortexPos) return null;
          const cx = LEFT_CORRIDOR_X - 100;
          const path = `M ${dataPos.x} ${dataPos.y} H ${cx} V ${cortexPos.y} H ${cortexPos.x}`;
          return (
            <g>
              <path d={path} fill="none" stroke="#84cc16" strokeWidth={8} opacity={0.04} filter="url(#glow-mem)" />
              <path d={path} fill="none" stroke="#84cc16" strokeWidth={1.5} opacity={0.45} strokeDasharray="5 6" />
              {zoom > 0.1 && (
                <g transform={`translate(${cx}, ${(dataPos.y + cortexPos.y) / 2})`}>
                  <rect x={-44} y={-10} width={88} height={18} rx={5} fill="#020817" opacity={0.95} />
                  <rect x={-44} y={-10} width={88} height={18} rx={5} fill="none" stroke="#84cc16" strokeWidth={0.8} opacity={0.4} />
                  <text x={0} y={5} textAnchor="middle" fill="#84cc16" fontSize={8} fontWeight="700" letterSpacing="0.07em" fontFamily="monospace">
                    ↑ MEMORY LOOP
                  </text>
                </g>
              )}
            </g>
          );
        })()}

        {/* Animated flow packets */}
        {zoom > 0.1 && NAMED_FLOWS.map(flow => {
          const steps = flow.steps.filter(id => LAYOUT.has(id));
          if (steps.length < 2) return null;
          const cx = flow.corridor === "left" ? LEFT_CORRIDOR_X : RIGHT_CORRIDOR_X;
          const first = getPos(steps[0]);
          const last = getPos(steps[steps.length - 1]);
          const p = `M ${first.x} ${first.y} H ${cx} V ${last.y} H ${last.x}`;
          const dur = 3 + NAMED_FLOWS.indexOf(flow) * 0.7;
          return (
            <g key={flow.id}>
              <circle r={4} fill={flow.color} opacity={0.85}>
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={p} />
              </circle>
              <circle r={8} fill={flow.color} opacity={0.15}>
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={p} />
              </circle>
            </g>
          );
        })}
      </g>

      {/* ── 4. Landmark nodes — pointer events re-enabled per node ── */}
      <g style={{ pointerEvents: "all" }}>
        {REGISTRY.map(node => (
          <LandmarkNode
            key={node.id}
            node={node}
            isSelected={selectedId === node.id}
            zoom={zoom}
            onClick={() => onSelectNode(node.id)}
          />
        ))}
      </g>
    </svg>
  );
}

// ── Agent Dock ────────────────────────────────────────────────────────────────

const DOCK_AGENTS = AGENT_ORDER.map(id => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  role: id === "abdi" ? "CEO" : id === "dame" ? "Ops" : id === "ayub" ? "Builder" :
        id === "ahmed" ? "Memory" : id === "atlas" ? "Marketing" : id === "rex" ? "Infra" :
        id === "prime" ? "Trading" : id === "sygma" ? "Ops" : id === "codex" ? "Execution" : "Assistant",
}));

function AgentDock({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div style={{
      position: "absolute", bottom: 26, left: "50%", transform: "translateX(-50%)",
      display: "flex", gap: 8, alignItems: "center",
      background: "#040810ee", border: "1px solid #1e293b",
      borderRadius: 40, padding: "8px 16px",
      zIndex: 100, backdropFilter: "blur(12px)",
      pointerEvents: "all",
    }}>
      {DOCK_AGENTS.map(da => (
        <div
          key={da.id}
          onClick={() => onOpen(da.id)}
          title={`${da.name} — ${da.role}`}
          style={{ position: "relative", cursor: "pointer" }}
        >
          <AgentAvatar agentId={da.id} name={da.name} size={36} />
          <span style={{
            position: "absolute", bottom: 0, right: 0,
            width: 8, height: 8, borderRadius: "50%",
            background: "#22c55e", border: "1.5px solid #040810",
          }} />
        </div>
      ))}
    </div>
  );
}

// ── Status Rail ───────────────────────────────────────────────────────────────

function StatusRail({ nodes }: { nodes: EcosystemNode[] }) {
  const counts = useMemo(() => {
    const c = { healthy: 0, degraded: 0, offline: 0, planned: 0, registry: 0, total: nodes.length };
    for (const n of nodes) {
      if (n.status === "healthy") c.healthy++;
      else if (n.status === "degraded") c.degraded++;
      else if (n.status === "offline") c.offline++;
      else if (n.status === "planned") c.planned++;
      else if (n.status === "registry-defined") c.registry++;
    }
    return c;
  }, [nodes]);

  const item = (label: string, val: number, color: string) => (
    <span style={{ fontSize: 11, color, display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {val} {label}
    </span>
  );

  return (
    <div style={{
      height: 26, background: "#030810", borderTop: "1px solid #1e293b",
      display: "flex", alignItems: "center", gap: 16, padding: "0 16px",
      fontSize: 11, color: "#475569", flexShrink: 0, zIndex: 20,
    }}>
      {counts.healthy > 0 && item("healthy", counts.healthy, "#22c55e")}
      {counts.degraded > 0 && item("degraded", counts.degraded, "#f59e0b")}
      {counts.offline > 0 && item("offline", counts.offline, "#ef4444")}
      {item("planned", counts.planned, "#8b5cf6")}
      <span style={{ marginLeft: "auto", color: "#334155", fontSize: 10 }}>
        {counts.registry} registry-defined · {counts.total} total nodes
      </span>
      <span style={{
        fontSize: 9, fontWeight: 700, color: "#f59e0b",
        background: "#f59e0b10", border: "1px solid #f59e0b33",
        borderRadius: 4, padding: "1px 7px", letterSpacing: "0.06em",
      }}>
        ⚠ REGISTRY DATA — not live-polled
      </span>
    </div>
  );
}

// ── Universe Canvas ───────────────────────────────────────────────────────────

export function VisionaryUniverse({ openRoute }: { openRoute?: (r: string) => void }) {
  const [cam, setCam] = useState<CameraState>({ x: 200, y: 40, z: 0.13 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExplorer, setShowExplorer] = useState(true);
  const [showGaps, setShowGaps] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [search, setSearch] = useState("");

  const camRef = useRef(cam);
  useEffect(() => { camRef.current = cam; }, [cam]);

  const divRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, cx: 0, cy: 0 });

  const selectedNode = selectedId ? REGISTRY_MAP.get(selectedId) ?? null : null;

  // Native wheel handler for zoom-to-cursor
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.88 : 1.14;
      setCam(c => {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const nz = Math.min(14, Math.max(0.04, c.z * delta));
        const nx = mx - (mx - c.x) * (nz / c.z);
        const ny = my - (my - c.y) * (nz / c.z);
        return { x: nx, y: ny, z: nz };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Pan
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setCam(c => ({
      ...c,
      x: panStart.current.cx + (e.clientX - panStart.current.x),
      y: panStart.current.cy + (e.clientY - panStart.current.y),
    }));
  };
  const onMouseUp = () => { isPanning.current = false; };

  // flyTo
  const flyTo = useCallback((id: string) => {
    setSelectedId(id);
    const pos = LAYOUT.get(id);
    if (!pos || !divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    const explorerW = showExplorer ? 220 : 0;
    const gapsW = showGaps && !showInspector ? 280 : 0;
    const inspW = showInspector ? 340 : 0;
    const vw = rect.width - explorerW - gapsW - inspW;
    const vh = rect.height - 44 - 26;
    const node = REGISTRY_MAP.get(id);
    const targetZ = node?.type === "agent" ? 1.0 : node?.layer === 5 ? 0.5 : 0.65;
    const targetX = explorerW + vw / 2 - pos.x * targetZ;
    const targetY = 44 + vh / 2 - pos.y * targetZ;
    const start = { ...camRef.current };
    const startTime = performance.now();
    const dur = 550;
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / dur);
      const e2 = ease(t);
      setCam({
        x: start.x + (targetX - start.x) * e2,
        y: start.y + (targetY - start.y) * e2,
        z: start.z + (targetZ - start.z) * e2,
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setShowInspector(true);
  }, [showExplorer, showGaps, showInspector]);

  // Fit all
  const fitAll = useCallback(() => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    const explorerW = showExplorer ? 220 : 0;
    const vw = rect.width - explorerW - 80;
    const vh = rect.height - 44 - 26 - 80;
    const scaleX = vw / SVG_WIDTH;
    const scaleY = vh / TOTAL_CANVAS_HEIGHT;
    const z = Math.min(scaleX, scaleY, 0.35);
    const cx = explorerW + 40 - (SVG_LEFT) * z;
    setCam({ x: cx, y: 60, z });
  }, [showExplorer]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#020817", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{
        height: 44, display: "flex", alignItems: "center", gap: 10,
        padding: "0 14px", borderBottom: "1px solid #1e293b",
        background: "#030810", flexShrink: 0, zIndex: 20,
      }}>
        <button
          onClick={() => setShowExplorer(v => !v)}
          style={{ background: showExplorer ? "#1e293b" : "none", border: "1px solid #1e293b", borderRadius: 5, color: "#64748b", padding: "3px 10px", fontSize: 11, cursor: "pointer" }}
        >
          Explorer
        </button>
        <span style={{ color: "#1e293b" }}>|</span>
        <span style={{ fontSize: 11, color: "#475569" }}>Task Enterprise Systems Universe</span>
        {selectedNode && (
          <>
            <span style={{ color: "#1e293b" }}>›</span>
            <span style={{ fontSize: 11, color: selectedNode.color }}>{selectedNode.name}</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search systems…"
          style={{
            background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 6,
            color: "#94a3b8", fontSize: 11, padding: "4px 10px", width: 180,
            outline: "none",
          }}
        />
        <button
          onClick={() => setShowGaps(v => !v)}
          style={{
            background: showGaps ? "#f59e0b18" : "none",
            border: `1px solid ${showGaps ? "#f59e0b44" : "#1e293b"}`,
            borderRadius: 5, color: showGaps ? "#f59e0b" : "#64748b",
            padding: "3px 10px", fontSize: 11, cursor: "pointer",
          }}
        >
          Gaps
        </button>
        <button
          onClick={fitAll}
          style={{ background: "none", border: "1px solid #1e293b", borderRadius: 5, color: "#64748b", padding: "3px 10px", fontSize: 11, cursor: "pointer" }}
        >
          Fit
        </button>
        <span style={{ fontSize: 10, color: "#334155" }}>{Math.round(cam.z * 100)}%</span>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {showExplorer && (
          <SystemExplorer selectedId={selectedId} onSelect={flyTo} filter={search} />
        )}

        {/* Canvas viewport */}
        <div
          ref={divRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            flex: 1, overflow: "hidden", position: "relative",
            cursor: isPanning.current ? "grabbing" : "grab",
            background: "radial-gradient(ellipse at 50% 20%, #060d1e 0%, #020817 80%)",
          }}
        >
          {/* World transform */}
          <div style={{
            position: "absolute",
            transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`,
            transformOrigin: "0 0",
            width: CANVAS_WIDTH,
            height: TOTAL_CANVAS_HEIGHT,
          }}>
            {/* Dot grid background */}
            <WorldBackground width={CANVAS_WIDTH} height={TOTAL_CANVAS_HEIGHT} />

            {/* The full world: terrain + routes + landmarks in one SVG */}
            <WorldSVG
              zoom={cam.z}
              selectedId={selectedId}
              onSelectNode={(id) => {
                setSelectedId(id);
                setShowInspector(true);
              }}
            />
          </div>

          {/* Agent dock — viewport pinned */}
          <AgentDock onOpen={id => openRoute?.(`/agents/${id}`)} />
        </div>

        {showGaps && !showInspector && (
          <GapsOverlay onFlyTo={flyTo} />
        )}

        {showInspector && selectedNode && (
          <InspectorPanel
            node={selectedNode}
            onClose={() => setShowInspector(false)}
          />
        )}
      </div>

      <StatusRail nodes={REGISTRY} />
    </div>
  );
}
