import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REGISTRY, REGISTRY_MAP } from "./visionary-registry";
import { NAMED_FLOWS, CROSS_EDGES } from "./visionary-connections";
import { LAYOUT, getPos, arcEdgePath, flowPath, fitCameraOrbital, UNIVERSE_RADIUS, UNIVERSE_DIAMETER } from "./visionary-layout";
import { InspectorPanel, GapsOverlay, SystemExplorer } from "./visionary-inspector";
import { AgentAvatar, agentColor, AGENT_ORDER } from "./agent-constants";
import { LandmarkNode, OrbitalRings, Starfield, WorldBackground } from "./visionary-world";
import type { EcosystemNode, CameraState } from "./visionary-types";

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

const WORLD_SIZE = UNIVERSE_DIAMETER + 600;

// ── Route Layer ───────────────────────────────────────────────────────────────

function RouteLayer({ zoom }: { zoom: number }) {
  return (
    <g>
      <defs>
        <filter id="glow-flow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {NAMED_FLOWS.map(f => (
          <marker key={f.id} id={`arr-${f.id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill={f.color} opacity="0.85" />
          </marker>
        ))}
      </defs>

      {/* Cross-system dependency edges */}
      <g opacity={zoom < 0.08 ? 0 : zoom < 0.15 ? (zoom - 0.08) / 0.07 : 1}>
        {CROSS_EDGES.map((edge, i) => {
          const path = arcEdgePath(edge.from, edge.to, 0.28);
          if (!path) return null;
          return <path key={i} d={path} fill="none" stroke={edge.color ?? "#3b82f620"} strokeWidth={1} />;
        })}
      </g>

      {/* Named flow loops */}
      {NAMED_FLOWS.map(flow => {
        const validSteps = flow.steps.filter(id => LAYOUT.has(id));
        if (validSteps.length < 2) return null;
        const path = flowPath(validSteps);
        if (!path) return null;
        const midStep = validSteps[Math.floor(validSteps.length / 2)];
        const midPos = getPos(midStep);

        return (
          <g key={flow.id}>
            {/* Glow */}
            <path d={path} fill="none" stroke={flow.color} strokeWidth={6} opacity={0.06} filter="url(#glow-flow)" />
            {/* Core line */}
            <path d={path} fill="none" stroke={flow.color} strokeWidth={1.8} opacity={0.65}
              strokeDasharray={flow.id === "memory-loop" ? "7 5" : undefined}
              markerEnd={`url(#arr-${flow.id})`} />
            {/* Flow label near midpoint */}
            {zoom > 0.08 && midPos && (
              <g transform={`translate(${midPos.x * 0.82}, ${midPos.y * 0.82})`}>
                <rect x={-38} y={-10} width={76} height={18} rx={5} fill="#020817" opacity={0.94} />
                <rect x={-38} y={-10} width={76} height={18} rx={5} fill="none" stroke={flow.color} strokeWidth={0.8} opacity={0.4} />
                <text x={0} y={5} textAnchor="middle" fill={flow.color}
                  fontSize={8} fontWeight="700" letterSpacing="0.07em" fontFamily="monospace">
                  {flow.label}
                </text>
              </g>
            )}
            {/* Animated packet */}
            {zoom > 0.07 && (
              <g>
                <circle r={4} fill={flow.color} opacity={0.9}>
                  <animateMotion dur={`${3.2 + NAMED_FLOWS.indexOf(flow) * 0.6}s`} repeatCount="indefinite" path={path} />
                </circle>
                <circle r={9} fill={flow.color} opacity={0.12}>
                  <animateMotion dur={`${3.2 + NAMED_FLOWS.indexOf(flow) * 0.6}s`} repeatCount="indefinite" path={path} />
                </circle>
              </g>
            )}
          </g>
        );
      })}

      {/* Memory return loops — special arcs from data ring inward to Cortex */}
      {[
        { from: "data.claude-memory", to: "cortex.memory", color: "#84cc16" },
        { from: "data.supabase",      to: "cortex.registry", color: "#22c55e" },
        { from: "data.notion",        to: "cortex.memory",   color: "#84cc16" },
      ].map(({ from, to, color }) => {
        const path = arcEdgePath(from, to, 0.5);
        if (!path) return null;
        return (
          <g key={`mem-${from}`}>
            <path d={path} fill="none" stroke={color} strokeWidth={4} opacity={0.06} filter="url(#glow-flow)" />
            <path d={path} fill="none" stroke={color} strokeWidth={1.2} opacity={0.5} strokeDasharray="5 6" />
          </g>
        );
      })}
    </g>
  );
}

// ── Full Universe SVG ─────────────────────────────────────────────────────────

function UniverseSVG({
  zoom, selectedId, onSelectNode,
}: {
  zoom: number;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}) {
  const half = WORLD_SIZE / 2;
  return (
    <svg
      style={{ position: "absolute", left: -half, top: -half, width: WORLD_SIZE, height: WORLD_SIZE, overflow: "visible" }}
      viewBox={`${-half} ${-half} ${WORLD_SIZE} ${WORLD_SIZE}`}
    >
      {/* Background stars */}
      <Starfield radius={UNIVERSE_RADIUS + 300} />

      {/* Orbital ring bands */}
      <OrbitalRings zoom={zoom} />

      {/* Routes */}
      <RouteLayer zoom={zoom} />

      {/* Landmark nodes — pointer-events on */}
      <g>
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
    }}>
      {DOCK_AGENTS.map(da => (
        <div key={da.id} onClick={() => onOpen(da.id)} title={`${da.name} — ${da.role}`}
          style={{ position: "relative", cursor: "pointer" }}>
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

  return (
    <div style={{
      height: 26, background: "#030810", borderTop: "1px solid #1e293b",
      display: "flex", alignItems: "center", gap: 16, padding: "0 16px",
      fontSize: 11, color: "#475569", flexShrink: 0, zIndex: 20,
    }}>
      {counts.healthy > 0 && (
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#22c55e" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          {counts.healthy} healthy
        </span>
      )}
      <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#8b5cf6" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8b5cf6" }} />
        {counts.planned} planned
      </span>
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

// ── Main Universe ─────────────────────────────────────────────────────────────

export function VisionaryUniverse({ openRoute }: { openRoute?: (r: string) => void }) {
  // Camera: x,y = viewport offset of world-center (0,0), z = scale
  const [cam, setCam] = useState<CameraState>({ x: 0, y: 0, z: 0.17 });
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

  // Center the universe on mount
  useEffect(() => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    const explorerW = 220;
    const gapsW = 280;
    const vw = rect.width - explorerW - gapsW;
    const vh = rect.height - 44 - 26;
    setCam({ x: explorerW + vw / 2, y: 44 + vh / 2, z: 0.17 });
  }, []);

  // Wheel zoom-to-cursor
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
        const nz = Math.min(20, Math.max(0.04, c.z * delta));
        const nx = mx - (mx - c.x) * (nz / c.z);
        const ny = my - (my - c.y) * (nz / c.z);
        return { x: nx, y: ny, z: nz };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

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
    // Zoom closer for small nodes, less for big ones
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
    const targetZ = r < 100 ? 0.4 : r < 500 ? 0.7 : r < 900 ? 0.85 : 1.0;
    // Camera x,y = where the world-space (0,0) would appear in viewport,
    // adjusted so `pos` lands at viewport center
    const targetX = explorerW + vw / 2 - pos.x * targetZ;
    const targetY = 44 + vh / 2 - pos.y * targetZ;
    const start = { ...camRef.current };
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / 550);
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

  const fitAll = useCallback(() => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    const explorerW = showExplorer ? 220 : 0;
    const vw = rect.width - explorerW - 60;
    const vh = rect.height - 44 - 26 - 60;
    const z = Math.min(vw / UNIVERSE_DIAMETER, vh / UNIVERSE_DIAMETER, 0.32);
    const cx = explorerW + vw / 2 + 30;
    const cy = 44 + vh / 2 + 30;
    const startCam = { ...camRef.current };
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / 500);
      const e2 = ease(t);
      setCam({
        x: startCam.x + (cx - startCam.x) * e2,
        y: startCam.y + (cy - startCam.y) * e2,
        z: startCam.z + (z - startCam.z) * e2,
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [showExplorer]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#020817", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{
        height: 44, display: "flex", alignItems: "center", gap: 10,
        padding: "0 14px", borderBottom: "1px solid #1e293b",
        background: "#030810", flexShrink: 0, zIndex: 20,
      }}>
        <button onClick={() => setShowExplorer(v => !v)}
          style={{ background: showExplorer ? "#1e293b" : "none", border: "1px solid #1e293b", borderRadius: 5, color: "#64748b", padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search systems…"
          style={{ background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 6, color: "#94a3b8", fontSize: 11, padding: "4px 10px", width: 180, outline: "none" }} />
        <button onClick={() => setShowGaps(v => !v)}
          style={{ background: showGaps ? "#f59e0b18" : "none", border: `1px solid ${showGaps ? "#f59e0b44" : "#1e293b"}`, borderRadius: 5, color: showGaps ? "#f59e0b" : "#64748b", padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
          Gaps
        </button>
        <button onClick={fitAll}
          style={{ background: "none", border: "1px solid #1e293b", borderRadius: 5, color: "#64748b", padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
          Fit
        </button>
        <span style={{ fontSize: 10, color: "#334155" }}>{Math.round(cam.z * 100)}%</span>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {showExplorer && (
          <SystemExplorer selectedId={selectedId} onSelect={flyTo} filter={search} />
        )}

        {/* Canvas */}
        <div
          ref={divRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            flex: 1, overflow: "hidden", position: "relative",
            cursor: isPanning.current ? "grabbing" : "grab",
            background: "radial-gradient(ellipse at 50% 50%, #060d1e 0%, #020817 75%)",
          }}
        >
          {/* World space — origin at (cam.x, cam.y) which represents world (0,0) */}
          <div style={{
            position: "absolute",
            left: 0, top: 0,
            width: "100%", height: "100%",
            transformOrigin: "0 0",
          }}>
            {/* SVG container positioned so world (0,0) is at cam.x, cam.y */}
            <div style={{
              position: "absolute",
              left: cam.x,
              top: cam.y,
              transform: `scale(${cam.z})`,
              transformOrigin: "0 0",
              width: 0,
              height: 0,
            }}>
              {/* Dot grid background */}
              <WorldBackground size={WORLD_SIZE} />

              {/* Universe SVG */}
              <UniverseSVG
                zoom={cam.z}
                selectedId={selectedId}
                onSelectNode={(id) => {
                  setSelectedId(id);
                  setShowInspector(true);
                }}
              />
            </div>
          </div>

          <AgentDock onOpen={id => openRoute?.(`/agents/${id}`)} />
        </div>

        {showGaps && !showInspector && (
          <GapsOverlay onFlyTo={flyTo} />
        )}

        {showInspector && selectedNode && (
          <InspectorPanel node={selectedNode} onClose={() => setShowInspector(false)} />
        )}
      </div>

      <StatusRail nodes={REGISTRY} />
    </div>
  );
}
