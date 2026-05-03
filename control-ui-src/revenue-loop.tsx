/**
 * Task Enterprise — Revenue Engine C2
 * Phase 4: Autonomous Loop Visualizer
 *   - LoopVisualizerPage
 *   - useLoopState (custom hook)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { LoopPhase } from "./revenue-types";
import { Panel } from "./revenue-components";

/* ══════════════════════════════════════════════════════════════
   CONSTANTS & MOCK DATA
══════════════════════════════════════════════════════════════ */

const AGENT_COLORS: Record<string, string> = {
  Abdi:  "#dc3545",
  Dame:  "#3b82f6",
  Ayub:  "#22c55e",
  Rex:   "#8b5cf6",
  Atlas: "#f97316",
  Prime: "#eab308",
  Ahmed: "#06b6d4",
  Sygma: "#ec4899",
};

const PHASE_COLORS: Record<LoopPhase, string> = {
  PLAN:    "#3b82f6",
  EXECUTE: "#22c55e",
  TRACK:   "#8b5cf6",
  ANALYZE: "#eab308",
  DECIDE:  "#f97316",
  ACT:     "#dc3545",
};

const PHASE_AGENTS: Record<LoopPhase, string> = {
  PLAN:    "Abdi",
  EXECUTE: "Dame",
  TRACK:   "Rex",
  ANALYZE: "Prime",
  DECIDE:  "Abdi",
  ACT:     "Atlas",
};

const ALL_PHASES: LoopPhase[] = ["PLAN", "EXECUTE", "TRACK", "ANALYZE", "DECIDE", "ACT"];

const MOCK_LOOP_HISTORY = [
  { id: 1247, timestamp: "2026-04-28T10:32:00Z", duration: 248, decisions: 3, actions: 7,  status: "success" as const },
  { id: 1246, timestamp: "2026-04-28T10:28:00Z", duration: 251, decisions: 2, actions: 5,  status: "success" as const },
  { id: 1245, timestamp: "2026-04-28T10:24:00Z", duration: 244, decisions: 4, actions: 9,  status: "success" as const },
  { id: 1244, timestamp: "2026-04-28T10:20:00Z", duration: 310, decisions: 1, actions: 3,  status: "warning" as const },
  { id: 1243, timestamp: "2026-04-28T10:16:00Z", duration: 238, decisions: 3, actions: 6,  status: "success" as const },
  { id: 1242, timestamp: "2026-04-28T10:12:00Z", duration: 241, decisions: 2, actions: 7,  status: "success" as const },
  { id: 1241, timestamp: "2026-04-28T10:08:00Z", duration: 255, decisions: 3, actions: 8,  status: "success" as const },
  { id: 1240, timestamp: "2026-04-28T10:04:00Z", duration: 402, decisions: 0, actions: 2,  status: "warning" as const },
  { id: 1239, timestamp: "2026-04-28T10:00:00Z", duration: 236, decisions: 4, actions: 10, status: "success" as const },
  { id: 1238, timestamp: "2026-04-28T09:56:00Z", duration: 243, decisions: 3, actions: 6,  status: "success" as const },
];

const MOCK_PHASE_STATS = [
  { phase: "PLAN",    avgDur: 1.2, successRate: 97, lastRuns: [1.1, 1.3, 1.2, 1.0, 1.4] },
  { phase: "EXECUTE", avgDur: 8.4, successRate: 91, lastRuns: [8.1, 9.2, 8.0, 10.1, 7.8] },
  { phase: "TRACK",   avgDur: 2.1, successRate: 99, lastRuns: [2.0, 2.2, 2.1, 2.3, 1.9] },
  { phase: "ANALYZE", avgDur: 3.8, successRate: 88, lastRuns: [3.5, 4.1, 3.8, 4.2, 3.6] },
  { phase: "DECIDE",  avgDur: 1.5, successRate: 94, lastRuns: [1.4, 1.6, 1.5, 1.7, 1.3] },
  { phase: "ACT",     avgDur: 4.2, successRate: 87, lastRuns: [4.0, 4.5, 4.1, 5.2, 3.9] },
];

/* ══════════════════════════════════════════════════════════════
   CUSTOM HOOK: useLoopState
══════════════════════════════════════════════════════════════ */

interface PhaseState {
  status: "done" | "active" | "pending";
  duration?: number;
}

interface LoopHookState {
  currentPhase: LoopPhase;
  phases: Record<LoopPhase, PhaseState>;
  cycleCount: number;
  isLive: boolean;
}

function buildInitialPhases(activeIdx: number): Record<LoopPhase, PhaseState> {
  const result = {} as Record<LoopPhase, PhaseState>;
  ALL_PHASES.forEach((p, i) => {
    if (i < activeIdx)      result[p] = { status: "done",    duration: Number((Math.random() * 8 + 1).toFixed(1)) };
    else if (i === activeIdx) result[p] = { status: "active" };
    else                    result[p] = { status: "pending" };
  });
  return result;
}

export function useLoopState() {
  const [activeIdx, setActiveIdx] = useState<number>(2);
  const [cycleCount, setCycleCount] = useState<number>(1247);
  const [isLive, setIsLive] = useState<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phases = buildInitialPhases(activeIdx);
  const currentPhase = ALL_PHASES[activeIdx];

  const startLive = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % ALL_PHASES.length;
        if (next === 0) setCycleCount((c) => c + 1);
        return next;
      });
    }, 2000);
  }, []);

  const stopLive = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const toggleLive = useCallback(() => {
    setIsLive((prev) => {
      if (prev) {
        stopLive();
        return false;
      } else {
        startLive();
        return true;
      }
    });
  }, [startLive, stopLive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const state: LoopHookState = { currentPhase, phases, cycleCount, isLive };
  return { state, toggleLive };
}

/* ══════════════════════════════════════════════════════════════
   COMPONENTS
══════════════════════════════════════════════════════════════ */

/** Animated glow pulse keyframes injected once */
const GLOW_STYLE = `
@keyframes re-glow-pulse {
  0%, 100% { box-shadow: 0 0 12px 2px var(--glow-color), 0 0 4px 1px var(--glow-color); opacity: 0.9; }
  50%       { box-shadow: 0 0 28px 8px var(--glow-color), 0 0 8px 2px var(--glow-color); opacity: 1; }
}
@keyframes re-orbit {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes re-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

function InjectStyles() {
  useEffect(() => {
    const id = "re-loop-injected-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = GLOW_STYLE;
      document.head.appendChild(el);
    }
  }, []);
  return null;
}

/* ─── Phase Node ─── */

interface PhaseNodeProps {
  phase: LoopPhase;
  phaseState: PhaseState;
  isActive: boolean;
  showArrow: boolean;
}

function PhaseNode({ phase, phaseState, isActive, showArrow }: PhaseNodeProps) {
  const color = PHASE_COLORS[phase];
  const agent = PHASE_AGENTS[phase];
  const agentColor = AGENT_COLORS[agent];
  const { status, duration } = phaseState;

  const isPending = status === "pending";
  const isDone = status === "done";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity: isPending ? 0.35 : 1,
        transition: "opacity 0.4s ease",
        animation: "re-fade-in 0.3s ease",
      }}>
        {/* Circle */}
        <div style={{
          position: "relative",
          width: 80,
          height: 80,
          borderRadius: "50%",
        }}>
          {/* Glow ring for active */}
          {isActive && (
            <div style={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              // @ts-ignore CSS custom property
              "--glow-color": color + "88",
              animation: "re-glow-pulse 2s ease-in-out infinite",
              background: "transparent",
              border: `2px solid ${color}44`,
            } as React.CSSProperties} />
          )}

          {/* Orbit spinner for active */}
          {isActive && (
            <div style={{
              position: "absolute",
              inset: -3,
              borderRadius: "50%",
              border: `2px solid transparent`,
              borderTopColor: color,
              borderRightColor: color + "44",
              animation: "re-orbit 1.2s linear infinite",
            }} />
          )}

          {/* Main circle */}
          <div style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "var(--surface-raised)",
            border: `2px solid ${isActive ? color : isDone ? color + "88" : "var(--border)"}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            boxShadow: isActive ? `0 0 16px ${color}33` : "none",
            transition: "border-color 0.4s ease, box-shadow 0.4s ease",
          }}>
            {/* Phase name */}
            <span style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.06em",
              color: isActive ? color : isDone ? color + "cc" : "var(--text-3)",
              fontFamily: "Inter, sans-serif",
              transition: "color 0.4s ease",
            }}>
              {phase}
            </span>
            {/* Status icon */}
            {isDone && (
              <span style={{ fontSize: 11, color: "#22c55e", lineHeight: 1 }}>✓</span>
            )}
            {isActive && (
              <span style={{ fontSize: 10, color, lineHeight: 1, animation: "re-glow-pulse 1s ease infinite" }}>
                ◉
              </span>
            )}
            {isPending && (
              <span style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1 }}>○</span>
            )}
          </div>
        </div>

        {/* Phase name below */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {/* Agent badge */}
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            color: agentColor,
            letterSpacing: "0.03em",
            background: agentColor + "18",
            border: `1px solid ${agentColor}33`,
            borderRadius: 3,
            padding: "1px 5px",
            lineHeight: 1.6,
          }}>
            {agent}
          </div>
          {/* Duration */}
          {isDone && duration !== undefined ? (
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>{duration}s</span>
          ) : isActive ? (
            <span style={{ fontSize: 10, color }}>running…</span>
          ) : (
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>pending</span>
          )}
        </div>
      </div>

      {/* Arrow connector */}
      {showArrow && (
        <div style={{
          display: "flex",
          alignItems: "center",
          paddingBottom: 32,
          paddingLeft: 4,
          paddingRight: 4,
        }}>
          <svg width={32} height={16} viewBox="0 0 32 16" style={{ flexShrink: 0 }}>
            <line x1={0} y1={8} x2={24} y2={8} stroke="var(--border-strong)" strokeWidth={1.5} />
            <polygon points="24,4 32,8 24,12" fill="var(--border-strong)" />
          </svg>
        </div>
      )}
    </div>
  );
}

/* ─── Phase Performance Table ─── */

function MiniSparkline({ runs }: { runs: number[] }) {
  const w = 60;
  const h = 18;
  const min = Math.min(...runs) * 0.9;
  const max = Math.max(...runs) * 1.1;
  const n = runs.length;

  const pts = runs.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Last point dot */}
      {(() => {
        const last = runs[runs.length - 1];
        const x = w;
        const y = h - ((last - min) / (max - min)) * h;
        return <circle cx={x} cy={y} r={2} fill="#3b82f6" />;
      })()}
    </svg>
  );
}

function PhaseStatsTable() {
  return (
    <div style={{ overflowX: "auto" }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "90px 90px 100px 80px 1fr",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border-strong)",
      }}>
        {["Phase", "Agent", "Avg Duration", "Success Rate", "Last 5 Runs"].map((h) => (
          <span key={h} style={{
            fontSize: 10, fontWeight: 600, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>{h}</span>
        ))}
      </div>

      {MOCK_PHASE_STATS.map((row) => {
        const color = PHASE_COLORS[row.phase as LoopPhase];
        const agent = PHASE_AGENTS[row.phase as LoopPhase];
        const agentColor = AGENT_COLORS[agent];
        const successColor = row.successRate >= 95 ? "#22c55e" : row.successRate >= 85 ? "#eab308" : "#ef4444";

        return (
          <div key={row.phase} style={{
            display: "grid",
            gridTemplateColumns: "90px 90px 100px 80px 1fr",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            alignItems: "center",
          }}>
            <span style={{
              fontSize: 11, fontWeight: 800, color,
              letterSpacing: "0.05em",
            }}>
              {row.phase}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: agentColor }}>{agent}</span>
            <span style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 600 }}>
              {row.avgDur}s avg
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: successColor }}>
              {row.successRate}%
            </span>
            <MiniSparkline runs={row.lastRuns} />
          </div>
        );
      })}
    </div>
  );
}

/* ─── Loop History Feed ─── */

function fmtTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function LoopHistoryFeed() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "60px 90px 90px 80px 80px 70px",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border-strong)",
      }}>
        {["Cycle", "Time", "Duration", "Decisions", "Actions", "Status"].map((h) => (
          <span key={h} style={{
            fontSize: 10, fontWeight: 600, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>{h}</span>
        ))}
      </div>

      {MOCK_LOOP_HISTORY.map((entry, idx) => {
        const statusColor = entry.status === "success" ? "#22c55e" : "#eab308";
        const statusIcon  = entry.status === "success" ? "✓" : "⚠";
        const isLatest = idx === 0;

        return (
          <div key={entry.id} style={{
            display: "grid",
            gridTemplateColumns: "60px 90px 90px 80px 80px 70px",
            gap: 8,
            padding: "9px 12px",
            borderBottom: "1px solid var(--border)",
            alignItems: "center",
            background: isLatest ? "rgba(59,130,246,0.04)" : "transparent",
            transition: "background 0.2s",
          }}>
            <span style={{
              fontSize: 12, fontWeight: 700, color: isLatest ? "#3b82f6" : "var(--text-2)",
              fontVariantNumeric: "tabular-nums",
            }}>
              #{entry.id}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
              {fmtTimestamp(entry.timestamp)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 600 }}>
              {fmtDuration(entry.duration)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              {entry.decisions} made
            </span>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              {entry.actions} run
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: statusColor,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {statusIcon} {entry.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Live Toggle Button ─── */

function LiveToggle({ isLive, onToggle }: { isLive: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 14px",
        borderRadius: "var(--r-md)",
        border: `1px solid ${isLive ? "#22c55e" : "var(--border-strong)"}`,
        background: isLive ? "rgba(34,197,94,0.1)" : "var(--surface-raised)",
        color: isLive ? "#22c55e" : "var(--text-2)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: "0.02em",
        transition: "all 0.2s ease",
      }}
    >
      {isLive ? (
        <>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#22c55e",
            animation: "re-pulse 1.5s infinite",
            display: "inline-block",
            flexShrink: 0,
          }} />
          LIVE
        </>
      ) : (
        <>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--border-strong)",
            display: "inline-block",
            flexShrink: 0,
          }} />
          PAUSED
        </>
      )}
    </button>
  );
}

/* ─── Cycle Summary Bar ─── */

function CycleSummaryBar({
  cycleCount,
  currentPhase,
}: {
  cycleCount: number;
  currentPhase: LoopPhase;
}) {
  const color = PHASE_COLORS[currentPhase];
  const agent = PHASE_AGENTS[currentPhase];

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 20,
      padding: "10px 16px",
      background: "var(--surface-raised)",
      borderRadius: "var(--r-md)",
      border: "1px solid var(--border)",
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 9.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Cycle
        </span>
        <span style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em" }}>
          #{cycleCount}
        </span>
      </div>
      <div style={{ width: 1, height: 32, background: "var(--border)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 9.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Active Phase
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color, letterSpacing: "0.04em" }}>
          {currentPhase}
        </span>
      </div>
      <div style={{ width: 1, height: 32, background: "var(--border)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 9.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Agent
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: AGENT_COLORS[agent] }}>
          {agent}
        </span>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 9.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Phase progress
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 120, height: 4, background: "var(--surface)", borderRadius: 2, overflow: "hidden" }}>
            {/* Animated indeterminate bar for the active phase */}
            <div style={{
              height: "100%", borderRadius: 2, background: color,
              width: "60%",
              transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{ fontSize: 11, color, fontWeight: 700 }}>running</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */

export function LoopVisualizerPage() {
  const { state, toggleLive } = useLoopState();
  const { currentPhase, phases, cycleCount, isLive } = state;

  return (
    <div className="re-page-content">
      <InjectStyles />

      {/* Page topbar override: live toggle in top-right */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
            Autonomous Loop Visualizer
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            PLAN → EXECUTE → TRACK → ANALYZE → DECIDE → ACT
          </div>
        </div>
        <LiveToggle isLive={isLive} onToggle={toggleLive} />
      </div>

      {/* Cycle summary */}
      <CycleSummaryBar cycleCount={cycleCount} currentPhase={currentPhase} />

      {/* Loop flow diagram */}
      <Panel title="Loop Flow" subtitle="current cycle state">
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          padding: "16px 8px",
          gap: 0,
          rowGap: 32,
          overflowX: "auto",
        }}>
          {ALL_PHASES.map((phase, idx) => (
            <PhaseNode
              key={phase}
              phase={phase}
              phaseState={phases[phase]}
              isActive={phase === currentPhase}
              showArrow={idx < ALL_PHASES.length - 1}
            />
          ))}
        </div>

        {/* Return arrow indicating loop */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "4px 0 8px",
          color: "var(--text-3)",
          fontSize: 11,
        }}>
          <svg width={240} height={20} viewBox="0 0 240 20">
            <path
              d="M 20 10 Q 120 18 220 10"
              fill="none"
              stroke="var(--border)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <polygon points="8,6 0,10 8,14" fill="var(--border)" />
            <polygon points="232,6 240,10 232,14" fill="var(--border)" />
          </svg>
          <span style={{ position: "absolute", fontSize: 10, color: "var(--text-3)" }}>
            continuous loop
          </span>
        </div>
      </Panel>

      {/* Phase performance table */}
      <Panel
        title="Phase Performance"
        subtitle="avg duration, success rate, sparkline of last 5 runs"
      >
        <PhaseStatsTable />
      </Panel>

      {/* Loop history feed */}
      <Panel
        title="Loop History"
        subtitle="last 10 completed cycles"
      >
        <LoopHistoryFeed />
      </Panel>
    </div>
  );
}
