/**
 * Task Enterprise — Revenue Engine C2
 * Phase 3: Intelligence Layer Pages
 *   - DecisionScoringPage
 *   - LearningFeedbackPage
 *   - PerformancePage
 */

import { Panel } from "./revenue-components";
import { fmtCurrency, fmtRelative } from "./revenue-types";

/* ══════════════════════════════════════════════════════════════
   MOCK DATA
══════════════════════════════════════════════════════════════ */

interface ScoredDecision {
  id: string;
  goal: string;
  action: string;
  target: string;
  confidence: number;
  totalScore: number;
  components: {
    historicalMatch: number;  // 0-100
    metricMomentum: number;
    goalUrgency: number;
    anomalyWeight: number;
  };
  timestamp: string;
}

const MOCK_SCORED_DECISIONS: ScoredDecision[] = [
  {
    id: "d-001",
    goal: "MRR $50K by May 31",
    action: "INCREASE",
    target: "LinkedIn Ad Budget +30%",
    confidence: 87,
    totalScore: 91,
    components: { historicalMatch: 88, metricMomentum: 94, goalUrgency: 96, anomalyWeight: 22 },
    timestamp: "2026-04-28T10:18:00Z",
  },
  {
    id: "d-002",
    goal: "New Customers ≥ 40/mo",
    action: "LAUNCH",
    target: "Email Sequence: Enterprise Vertical",
    confidence: 74,
    totalScore: 78,
    components: { historicalMatch: 71, metricMomentum: 68, goalUrgency: 85, anomalyWeight: 10 },
    timestamp: "2026-04-28T09:54:00Z",
  },
  {
    id: "d-003",
    goal: "CAC < $400",
    action: "PAUSE",
    target: "Google Display Campaign #7",
    confidence: 92,
    totalScore: 88,
    components: { historicalMatch: 92, metricMomentum: 76, goalUrgency: 72, anomalyWeight: 65 },
    timestamp: "2026-04-28T09:30:00Z",
  },
  {
    id: "d-004",
    goal: "Conversion Rate > 7%",
    action: "HOLD",
    target: "Landing Page Variant B",
    confidence: 61,
    totalScore: 59,
    components: { historicalMatch: 55, metricMomentum: 60, goalUrgency: 58, anomalyWeight: 8 },
    timestamp: "2026-04-28T08:44:00Z",
  },
];

interface LearnedPattern {
  id: string;
  trigger: string;
  learned: string;
  applied: number;
  confidenceDelta: number;
  lastApplied: string;
  beforePerf: number;
  afterPerf: number;
}

const MOCK_PATTERNS: LearnedPattern[] = [
  {
    id: "p1",
    trigger: "LinkedIn ROAS > 3.5x for 5+ days",
    learned: "Increase budget by 30-40% yields +18% conversions on average",
    applied: 7,
    confidenceDelta: +12,
    lastApplied: "2h ago",
    beforePerf: 62,
    afterPerf: 80,
  },
  {
    id: "p2",
    trigger: "CTR drop > 25% within 2h window",
    learned: "Immediate pause + reallocation recovers 80% of lost spend within 48h",
    applied: 3,
    confidenceDelta: +8,
    lastApplied: "18m ago",
    beforePerf: 44,
    afterPerf: 71,
  },
  {
    id: "p3",
    trigger: "Email sequence open rate > 45%",
    learned: "Accelerated follow-up (day 1/3/7) vs standard (1/7/14) yields +34% conversion",
    applied: 2,
    confidenceDelta: +15,
    lastApplied: "2d ago",
    beforePerf: 38,
    afterPerf: 67,
  },
];

const MOCK_PERF_COMPARE = [
  { metric: "MRR",             current: 48200, lastCycle: 44800, bestCycle: 51200, unit: "$" },
  { metric: "New Customers",   current: 34,    lastCycle: 31,    bestCycle: 41,    unit: "" },
  { metric: "Conversion Rate", current: 6.2,   lastCycle: 5.9,   bestCycle: 6.8,   unit: "%" },
  { metric: "CAC",             current: 420,   lastCycle: 445,   bestCycle: 340,   unit: "$" },
];

// Confidence trend: 30 synthetic data points
const CONFIDENCE_TREND: number[] = [
  62, 64, 63, 67, 70, 69, 72, 74, 71, 73,
  75, 77, 76, 79, 78, 80, 82, 81, 83, 85,
  84, 86, 85, 88, 87, 89, 88, 90, 91, 90,
];

/* ══════════════════════════════════════════════════════════════
   SVG HELPERS
══════════════════════════════════════════════════════════════ */

const COMPONENT_COLORS = {
  historicalMatch:  "#3b82f6",
  metricMomentum:   "#22c55e",
  goalUrgency:      "#f97316",
  anomalyWeight:    "#ec4899",
};

const COMPONENT_LABELS: Record<string, string> = {
  historicalMatch: "Historical Match",
  metricMomentum:  "Metric Momentum",
  goalUrgency:     "Goal Urgency",
  anomalyWeight:   "Anomaly Weight",
};

/** Draw arc segments as SVG paths on a ring */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

interface RingProps {
  components: ScoredDecision["components"];
  totalScore: number;
  size?: number;
}

function ScoreRing({ components, totalScore, size = 100 }: RingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const strokeWidth = size * 0.1;
  const gapDeg = 4;

  // Weights sum to 100 for the ring display
  const keys = Object.keys(components) as (keyof typeof components)[];
  const values = keys.map((k) => components[k]);
  const total = values.reduce((a, b) => a + b, 0);

  // Convert each component's proportion to degrees (full 360°)
  // With small gaps between arcs
  const totalGap = gapDeg * keys.length;
  const availDeg = 360 - totalGap;

  let cursor = 0;
  const arcs = keys.map((k, i) => {
    const frac = values[i] / total;
    const span = frac * availDeg;
    const start = cursor + i * gapDeg;
    const end = start + span;
    cursor += span;
    return { key: k, start, end };
  });

  // Score color
  const scoreColor = totalScore >= 80 ? "#22c55e" : totalScore >= 60 ? "#eab308" : "#ef4444";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {/* track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-raised)" strokeWidth={strokeWidth} />
      {/* arcs */}
      {arcs.map(({ key, start, end }) => (
        <path
          key={key}
          d={describeArc(cx, cy, r, start, end)}
          fill="none"
          stroke={COMPONENT_COLORS[key as keyof typeof COMPONENT_COLORS]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
      {/* center score */}
      <text
        x={cx} y={cy - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={scoreColor}
        fontSize={size * 0.2}
        fontWeight={700}
        fontFamily="Inter, sans-serif"
      >
        {totalScore}
      </text>
      <text
        x={cx} y={cy + size * 0.14}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text-3)"
        fontSize={size * 0.09}
        fontFamily="Inter, sans-serif"
      >
        SCORE
      </text>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════
   PAGE: Decision Scoring
══════════════════════════════════════════════════════════════ */

function ComponentBar({
  label, value, color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{
        height: 4,
        background: "var(--surface-raised)",
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function DecisionScoringCard({ d }: { d: ScoredDecision }) {
  const actionColor: Record<string, string> = {
    INCREASE: "#22c55e", LAUNCH: "#22c55e", PAUSE: "#eab308",
    DECREASE: "#eab308", KILL: "#ef4444", HOLD: "#888",
  };
  const ac = actionColor[d.action] ?? "#888";

  return (
    <div style={{
      background: "var(--surface-raised)",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em",
          padding: "2px 7px", border: `1px solid ${ac}`, borderRadius: 3,
          color: ac, flexShrink: 0, marginTop: 2,
        }}>
          {d.action}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{d.target}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{d.goal}</div>
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
          {fmtRelative(d.timestamp)}
        </div>
      </div>

      {/* Ring + component bars */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <ScoreRing components={d.components} totalScore={d.totalScore} size={96} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {(Object.keys(d.components) as (keyof typeof d.components)[]).map((k) => (
            <ComponentBar
              key={k}
              label={COMPONENT_LABELS[k]}
              value={d.components[k]}
              color={COMPONENT_COLORS[k]}
            />
          ))}
        </div>
      </div>

      {/* Confidence footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500 }}>CONFIDENCE</span>
        <div style={{ flex: 1, height: 3, background: "var(--surface)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            width: `${d.confidence}%`, height: "100%", borderRadius: 2,
            background: d.confidence >= 80 ? "#22c55e" : d.confidence >= 60 ? "#eab308" : "#ef4444",
            transition: "width 0.6s ease",
          }} />
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: d.confidence >= 80 ? "#22c55e" : d.confidence >= 60 ? "#eab308" : "#ef4444",
        }}>
          {d.confidence}%
        </span>
      </div>
    </div>
  );
}

export function DecisionScoringPage() {
  return (
    <div className="re-page-content">
      {/* Legend */}
      <Panel title="Score Component Key" subtitle="how each decision ring is built">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {Object.entries(COMPONENT_LABELS).map(([k, label]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                background: COMPONENT_COLORS[k as keyof typeof COMPONENT_COLORS],
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
          Ring arc size = relative contribution. Center value = composite score (0–100).
          Anomaly weight inflates urgency when outlier signals detected. Higher score = stronger action signal.
        </div>
      </Panel>

      {/* Scored decisions */}
      <Panel title="Decision Scoring Breakdown" subtitle={`${MOCK_SCORED_DECISIONS.length} decisions scored this cycle`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {MOCK_SCORED_DECISIONS.map((d) => (
            <DecisionScoringCard key={d.id} d={d} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PAGE: Learning Feedback
══════════════════════════════════════════════════════════════ */

function BeforeAfterBar({ label, before, after }: { label: string; before: number; after: number }) {
  const gain = after - before;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>+{gain} pts</span>
      </div>
      {/* Before bar */}
      <div style={{ position: "relative", height: 20 }}>
        <div style={{
          height: 8, background: "var(--surface-raised)", borderRadius: 4, overflow: "hidden",
          marginBottom: 2,
        }}>
          <div style={{
            width: `${before}%`, height: "100%", background: "#888", borderRadius: 4,
          }} />
        </div>
        <div style={{ height: 8, background: "var(--surface-raised)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            width: `${after}%`, height: "100%", background: "#22c55e", borderRadius: 4,
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <span style={{ fontSize: 10, color: "#888" }}>Before: {before}</span>
        <span style={{ fontSize: 10, color: "#22c55e" }}>After: {after}</span>
      </div>
    </div>
  );
}

function PatternCard({ p }: { p: LearnedPattern }) {
  return (
    <div style={{
      background: "var(--surface-raised)",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "rgba(59,130,246,0.12)",
          border: "1px solid rgba(59,130,246,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "#3b82f6", fontWeight: 800, flexShrink: 0,
        }}>
          {p.id.replace("p", "")}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}>TRIGGER</div>
          <div style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 600, lineHeight: 1.45 }}>{p.trigger}</div>
        </div>
      </div>

      {/* Learned insight */}
      <div style={{
        background: "rgba(34,197,94,0.05)",
        border: "1px solid rgba(34,197,94,0.15)",
        borderRadius: "var(--r-md)",
        padding: "8px 12px",
      }}>
        <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, marginBottom: 4, letterSpacing: "0.04em" }}>
          LEARNED PATTERN
        </div>
        <div style={{ fontSize: 12, color: "var(--text-1)", lineHeight: 1.55 }}>{p.learned}</div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 9.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Applied</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.04em" }}>{p.applied}×</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 9.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Confidence Delta</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#22c55e", letterSpacing: "-0.04em" }}>
            +{p.confidenceDelta}%
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 9.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Last Applied</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{p.lastApplied}</span>
        </div>
      </div>

      {/* Before / after performance */}
      <BeforeAfterBar label="Performance Score" before={p.beforePerf} after={p.afterPerf} />
    </div>
  );
}

export function LearningFeedbackPage() {
  return (
    <div className="re-page-content">
      <Panel title="Feedback Loop — Learned Patterns" subtitle="extracted from cycle history">
        <div style={{ marginBottom: 10, fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
          These patterns were identified by analyzing decision outcomes vs. predictions.
          Each pattern is applied automatically when its trigger condition is met.
          Confidence delta measures how much the pattern shifted overall model confidence.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {MOCK_PATTERNS.map((p) => (
            <PatternCard key={p.id} p={p} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PAGE: Performance Comparison
══════════════════════════════════════════════════════════════ */

function formatMetricValue(val: number, unit: string): string {
  if (unit === "$") return fmtCurrency(val);
  if (unit === "%") return `${val.toFixed(1)}%`;
  return val.toString();
}

/** Clustered bar chart: current / lastCycle / bestCycle per metric */
function PerformanceBarChart() {
  const svgW = 620;
  const svgH = 240;
  const marginL = 60;
  const marginR = 24;
  const marginT = 24;
  const marginB = 36;
  const chartW = svgW - marginL - marginR;
  const chartH = svgH - marginT - marginB;

  const groupCount = MOCK_PERF_COMPARE.length;
  const barCount = 3;
  const groupGap = 24;
  const barGap = 3;
  const groupW = (chartW - groupGap * (groupCount - 1)) / groupCount;
  const barW = (groupW - barGap * (barCount - 1)) / barCount;

  const BAR_COLORS = ["#3b82f6", "#eab308", "#22c55e"];
  const BAR_LABELS = ["Current", "Last Cycle", "Best Cycle"];

  // Normalize each metric relative to its own max
  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width="100%"
      style={{ display: "block", maxHeight: svgH }}
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = marginT + chartH * (1 - frac);
        return (
          <line
            key={frac}
            x1={marginL} y1={y} x2={marginL + chartW} y2={y}
            stroke="var(--border)" strokeWidth={1}
          />
        );
      })}

      {/* Bars */}
      {MOCK_PERF_COMPARE.map((row, gi) => {
        const values = [row.current, row.lastCycle, row.bestCycle];
        const maxVal = Math.max(...values);
        const groupX = marginL + gi * (groupW + groupGap);

        return (
          <g key={row.metric}>
            {values.map((val, bi) => {
              const norm = val / maxVal;
              const barH = chartH * norm;
              const x = groupX + bi * (barW + barGap);
              const y = marginT + chartH - barH;
              return (
                <g key={bi}>
                  <rect x={x} y={y} width={barW} height={barH} rx={3} fill={BAR_COLORS[bi]} opacity={0.85} />
                  <title>{`${row.metric} — ${BAR_LABELS[bi]}: ${formatMetricValue(val, row.unit)}`}</title>
                </g>
              );
            })}
            {/* Metric label */}
            <text
              x={groupX + groupW / 2}
              y={marginT + chartH + 18}
              textAnchor="middle"
              fill="var(--text-3)"
              fontSize={10}
              fontFamily="Inter, sans-serif"
            >
              {row.metric}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      {BAR_LABELS.map((label, i) => {
        const lx = marginL + i * 100;
        return (
          <g key={label}>
            <rect x={lx} y={7} width={8} height={8} rx={2} fill={BAR_COLORS[i]} />
            <text x={lx + 12} y={15} fill="var(--text-3)" fontSize={9.5} fontFamily="Inter, sans-serif">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Polyline confidence trend over last 30 cycles */
function ConfidenceTrendLine() {
  const svgW = 620;
  const svgH = 120;
  const marginL = 44;
  const marginR = 16;
  const marginT = 16;
  const marginB = 24;
  const chartW = svgW - marginL - marginR;
  const chartH = svgH - marginT - marginB;

  const minV = Math.min(...CONFIDENCE_TREND) - 5;
  const maxV = Math.max(...CONFIDENCE_TREND) + 5;
  const n = CONFIDENCE_TREND.length;

  const pts = CONFIDENCE_TREND.map((v, i) => {
    const x = marginL + (i / (n - 1)) * chartW;
    const y = marginT + chartH - ((v - minV) / (maxV - minV)) * chartH;
    return `${x},${y}`;
  }).join(" ");

  // Area fill points
  const firstX = marginL;
  const lastX = marginL + chartW;
  const baseY = marginT + chartH;
  const areaPoints = `${firstX},${baseY} ${pts} ${lastX},${baseY}`;

  // Y-axis labels
  const yTicks = [minV + 5, Math.round((minV + maxV) / 2), maxV - 5];

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width="100%"
      style={{ display: "block", maxHeight: svgH }}
    >
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Grid */}
      {[0, 0.5, 1].map((frac) => {
        const y = marginT + chartH * frac;
        return (
          <line key={frac} x1={marginL} y1={y} x2={marginL + chartW} y2={y}
            stroke="var(--border)" strokeWidth={1} />
        );
      })}

      {/* Area fill */}
      <polygon points={areaPoints} fill="url(#trend-fill)" />

      {/* Trend line */}
      <polyline
        points={pts}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Current value dot */}
      {(() => {
        const last = CONFIDENCE_TREND[n - 1];
        const x = marginL + chartW;
        const y = marginT + chartH - ((last - minV) / (maxV - minV)) * chartH;
        return (
          <g>
            <circle cx={x} cy={y} r={4} fill="#3b82f6" />
            <text x={x - 4} y={y - 8} textAnchor="middle" fill="#3b82f6"
              fontSize={10} fontWeight={700} fontFamily="Inter, sans-serif">
              {last}%
            </text>
          </g>
        );
      })()}

      {/* Y-axis */}
      {yTicks.map((v) => {
        const y = marginT + chartH - ((v - minV) / (maxV - minV)) * chartH;
        return (
          <text key={v} x={marginL - 6} y={y + 4} textAnchor="end"
            fill="var(--text-3)" fontSize={9} fontFamily="Inter, sans-serif">
            {v}%
          </text>
        );
      })}

      {/* X-axis label */}
      <text x={marginL} y={svgH - 4} fill="var(--text-3)" fontSize={9} fontFamily="Inter, sans-serif">
        30 cycles ago
      </text>
      <text x={marginL + chartW} y={svgH - 4} textAnchor="end"
        fill="var(--text-3)" fontSize={9} fontFamily="Inter, sans-serif">
        Now
      </text>
    </svg>
  );
}

/** Metric comparison table */
function MetricCompareTable() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 100px 100px 80px",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border-strong)",
      }}>
        {["Metric", "Current", "Last Cycle", "Best Cycle", "vs Last"].map((h) => (
          <span key={h} style={{
            fontSize: 10, fontWeight: 600, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>{h}</span>
        ))}
      </div>
      {MOCK_PERF_COMPARE.map((row) => {
        const delta = row.unit === "$"
          ? ((row.current - row.lastCycle) / row.lastCycle * 100).toFixed(1)
          : (row.current - row.lastCycle).toFixed(1);
        const isPositive = row.metric === "CAC"
          ? row.current < row.lastCycle
          : row.current > row.lastCycle;
        const deltaColor = isPositive ? "#22c55e" : "#ef4444";
        const deltaSign = row.metric === "CAC"
          ? (row.current < row.lastCycle ? "↓" : "↑")
          : (row.current > row.lastCycle ? "↑" : "↓");

        return (
          <div key={row.metric} style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 100px 100px 80px",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{row.metric}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6" }}>
              {formatMetricValue(row.current, row.unit)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              {formatMetricValue(row.lastCycle, row.unit)}
            </span>
            <span style={{ fontSize: 12, color: "#22c55e" }}>
              {formatMetricValue(row.bestCycle, row.unit)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor }}>
              {deltaSign} {Math.abs(Number(delta))}{row.unit === "$" ? "%" : row.unit || "%"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PerformancePage() {
  return (
    <div className="re-page-content">
      {/* Metric comparison table */}
      <Panel title="Cycle Performance Comparison" subtitle="current vs last cycle vs best cycle">
        <MetricCompareTable />
      </Panel>

      {/* Bar chart */}
      <Panel title="Performance Bar Chart" subtitle="normalized per-metric comparison">
        <PerformanceBarChart />
      </Panel>

      {/* Confidence trend */}
      <Panel title="Confidence Trend" subtitle="last 30 decision cycles">
        <div style={{ marginBottom: 8, fontSize: 11, color: "var(--text-3)" }}>
          Composite decision confidence score averaged across all decisions per cycle. Upward trend indicates
          the learning loop is converging on reliable patterns.
        </div>
        <ConfidenceTrendLine />
      </Panel>
    </div>
  );
}
