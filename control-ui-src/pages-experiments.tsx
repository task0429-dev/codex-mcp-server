/**
 * Task Enterprise — Revenue Engine C2
 * Phase 5: Experiments + Optimization Pages
 * Exports: ExperimentsPage, ExperimentDetailPage
 */

import { useState } from "react";
import type { Experiment, ExperimentStatus, ExperimentVariant } from "./revenue-types";
import { Panel, EmptyState } from "./revenue-components";

/* ─── Mock Data ─── */

const MOCK_EXPERIMENTS: (Experiment & {
  daysRunning: number;
  goal: string;
  winner?: string;
  endDate?: string;
})[] = [
  {
    id: "e1",
    name: "LinkedIn Ad Copy A/B",
    status: "running",
    hypothesis: "Problem-aware copy converts 20%+ better than feature-led copy",
    metric: "Conversion Rate",
    goal: "Q2 MRR Target",
    startDate: "2026-04-14",
    daysRunning: 14,
    variants: [
      { id: "control", name: "Control (Feature)", value: 4.8, uplift: 0, confidence: 95, sampleSize: 840 },
      { id: "a", name: "Problem-Aware", value: 5.9, uplift: 22.9, confidence: 87, sampleSize: 832 },
    ],
  },
  {
    id: "e2",
    name: "Pricing Page Layout",
    status: "running",
    hypothesis: "Single CTA focus increases conversion vs 3-plan comparison layout",
    metric: "Trial Signups",
    goal: "Q2 MRR Target",
    startDate: "2026-04-21",
    daysRunning: 7,
    variants: [
      { id: "control", name: "3-Plan Layout", value: 3.2, uplift: 0, confidence: 95, sampleSize: 1240 },
      { id: "a", name: "Single CTA", value: 3.55, uplift: 11.0, confidence: 72, sampleSize: 1238 },
    ],
  },
  {
    id: "e3",
    name: "Email Sequence Timing",
    status: "winner",
    hypothesis: "Day 1/3/7 timing outperforms day 1/7/14",
    metric: "Email Conversion",
    goal: "Conversion Rate",
    startDate: "2026-04-01",
    endDate: "2026-04-21",
    daysRunning: 20,
    winner: "a",
    variants: [
      { id: "control", name: "1/7/14 (Standard)", value: 2.4, uplift: 0, confidence: 95, sampleSize: 620 },
      { id: "a", name: "1/3/7 (Accelerated)", value: 3.2, uplift: 33.3, confidence: 98, sampleSize: 618 },
    ],
  },
  {
    id: "e4",
    name: "Hero CTA Color",
    status: "loser",
    hypothesis: "Red CTA button outperforms white on dark background",
    metric: "Click-through Rate",
    goal: "CAC Reduction",
    startDate: "2026-04-10",
    endDate: "2026-04-24",
    daysRunning: 14,
    variants: [
      { id: "control", name: "White Button", value: 8.4, uplift: 0, confidence: 95, sampleSize: 2100 },
      { id: "a", name: "Red Button", value: 7.9, uplift: -5.9, confidence: 91, sampleSize: 2098 },
    ],
  },
  {
    id: "e5",
    name: "Checkout Flow Simplification",
    status: "pending",
    hypothesis: "Remove company field from checkout — reduces friction",
    metric: "Checkout Completion",
    goal: "Q2 MRR Target",
    startDate: "2026-05-01",
    daysRunning: 0,
    variants: [
      { id: "control", name: "5-Field Form", value: 0, uplift: 0, confidence: 0, sampleSize: 0 },
      { id: "a", name: "4-Field Form", value: 0, uplift: 0, confidence: 0, sampleSize: 0 },
    ],
  },
];

/* ─── Helpers ─── */

function statusLabel(s: ExperimentStatus): string {
  return { running: "Running", winner: "Winner", loser: "Loser", inconclusive: "Inconclusive", pending: "Pending" }[s] ?? s;
}

function statusClass(s: ExperimentStatus): string {
  return (
    {
      running: "re-exp-status-running",
      winner: "re-exp-status-winner",
      loser: "re-exp-status-loser",
      inconclusive: "re-exp-status-pending",
      pending: "re-exp-status-pending",
    }[s] ?? "re-exp-status-pending"
  );
}

function variantColor(v: ExperimentVariant, isControl: boolean): string {
  if (isControl) return "#555";
  if (v.uplift > 0) return "#22c55e";
  if (v.uplift < 0) return "#ef4444";
  return "#888";
}

function confidenceColor(c: number): string {
  if (c >= 95) return "#22c55e";
  if (c >= 80) return "#eab308";
  if (c === 0) return "#555";
  return "#ef4444";
}

function fmtUplift(u: number): string {
  if (u === 0) return "—";
  return `${u >= 0 ? "+" : ""}${u.toFixed(1)}%`;
}

function maxVariantValue(variants: ExperimentVariant[]): number {
  return Math.max(...variants.map((v) => v.value), 1);
}

/* ─── VariantBars ─── */

function VariantBars({ variants, status }: { variants: ExperimentVariant[]; status: ExperimentStatus }) {
  const maxVal = maxVariantValue(variants);
  return (
    <div className="re-exp-variants">
      {variants.map((v, i) => {
        const isControl = v.id === "control" || i === 0;
        const color = variantColor(v, isControl);
        const barW = status === "pending" ? 0 : Math.max((v.value / maxVal) * 100, 0);
        return (
          <div key={v.id} className="re-variant-row">
            <span
              className="re-variant-name"
              style={{ color: isControl ? "var(--text-3)" : "var(--text-2)" }}
              title={v.name}
            >
              {v.name.length > 10 ? v.name.slice(0, 9) + "…" : v.name}
            </span>
            <div className="re-variant-bar-track">
              <div
                className="re-variant-bar-fill"
                style={{ width: `${barW}%`, background: color, transition: "width 0.5s ease" }}
              />
            </div>
            <span style={{ fontSize: 11, color: "var(--text-2)", width: 36, textAlign: "right", flexShrink: 0 }}>
              {status === "pending" ? "—" : `${v.value.toFixed(1)}%`}
            </span>
            <span
              className="re-variant-uplift"
              style={{ color: v.uplift > 0 ? "#22c55e" : v.uplift < 0 ? "#ef4444" : "var(--text-3)" }}
            >
              {fmtUplift(v.uplift)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── ExperimentCard ─── */

type MockExp = (typeof MOCK_EXPERIMENTS)[number];

function ExperimentCard({
  exp,
  onSelect,
  onPromote,
}: {
  exp: MockExp;
  onSelect: (id: string) => void;
  onPromote: (id: string) => void;
}) {
  const [promoting, setPromoting] = useState(false);

  async function handlePromote(e: React.MouseEvent) {
    e.stopPropagation();
    setPromoting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setPromoting(false);
    onPromote(exp.id);
  }

  const bestVariant = exp.winner
    ? exp.variants.find((v) => v.id === exp.winner)
    : exp.variants.slice(1).sort((a, b) => b.uplift - a.uplift)[0];

  const totalSamples = exp.variants.reduce((s, v) => s + v.sampleSize, 0);

  return (
    <div
      className="re-experiment-card"
      style={{ cursor: "pointer" }}
      onClick={() => onSelect(exp.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(exp.id)}
    >
      {/* Head */}
      <div className="re-exp-head">
        <span className="re-exp-name">{exp.name}</span>
        <span className={`re-exp-status ${statusClass(exp.status)}`}>{statusLabel(exp.status)}</span>
      </div>

      {/* Hypothesis */}
      <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>
        {exp.hypothesis}
      </p>

      {/* Variant bars */}
      <VariantBars variants={exp.variants} status={exp.status} />

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          paddingTop: 4,
          borderTop: "1px solid var(--border)",
        }}
      >
        {/* Confidence */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Confidence
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: confidenceColor(bestVariant?.confidence ?? 0) }}>
            {exp.status === "pending" ? "—" : `${bestVariant?.confidence ?? 0}%`}
          </span>
        </div>

        {/* Sample size */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Samples
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
            {exp.status === "pending" ? "—" : totalSamples.toLocaleString()}
          </span>
        </div>

        {/* Uplift */}
        {bestVariant && bestVariant.uplift !== 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Uplift
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: bestVariant.uplift > 0 ? "#22c55e" : "#ef4444",
              }}
            >
              {fmtUplift(bestVariant.uplift)}
            </span>
          </div>
        )}

        {/* Days / date range */}
        <div style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-3)" }}>
          {exp.status === "pending"
            ? `Starts ${exp.startDate}`
            : exp.endDate
            ? `${exp.startDate} – ${exp.endDate}`
            : `${exp.daysRunning}d running`}
        </div>

        {/* Promote button */}
        {exp.status === "winner" && (
          <button
            onClick={handlePromote}
            disabled={promoting}
            style={{
              padding: "4px 12px",
              background: promoting ? "rgba(34,197,94,0.1)" : "rgba(34,197,94,0.15)",
              color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: "var(--r-md)",
              fontSize: 11,
              fontWeight: 700,
              cursor: promoting ? "not-allowed" : "pointer",
              letterSpacing: "0.02em",
              opacity: promoting ? 0.7 : 1,
              transition: "all 0.15s",
            }}
          >
            {promoting ? "Promoting…" : "Promote Winner"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Summary Metric Card ─── */

function SummaryCard({
  label,
  value,
  sub,
  color = "var(--text-1)",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="re-metric-card">
      <span className="re-metric-label">{label}</span>
      <div className="re-metric-value" style={{ color, fontSize: 26 }}>
        {value}
      </div>
      {sub && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</span>}
    </div>
  );
}

/* ─── Filter Tabs ─── */

const FILTER_TABS: { key: ExperimentStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "winner", label: "Winner" },
  { key: "loser", label: "Loser" },
  { key: "pending", label: "Pending" },
];

/* ─── ExperimentsPage ─── */

export function ExperimentsPage({
  onSelectExperiment,
}: {
  onSelectExperiment?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<ExperimentStatus | "all">("all");
  const [promoted, setPromoted] = useState<Set<string>>(new Set());

  const experiments = MOCK_EXPERIMENTS;

  const filtered =
    filter === "all" ? experiments : experiments.filter((e) => e.status === filter);

  // Summary stats
  const running = experiments.filter((e) => e.status === "running").length;
  const winners = experiments.filter((e) => e.status === "winner").length;
  const avgUplift = (() => {
    const completed = experiments.filter(
      (e) => e.status === "winner" && e.winner
    );
    if (!completed.length) return 0;
    const sum = completed.reduce((acc, e) => {
      const wv = e.variants.find((v) => v.id === e.winner);
      return acc + (wv?.uplift ?? 0);
    }, 0);
    return sum / completed.length;
  })();

  const revLifted = "$4.2K";

  function handlePromote(id: string) {
    setPromoted((prev) => new Set([...prev, id]));
  }

  return (
    <div className="re-page-content">
      {/* Summary row */}
      <div className="re-metrics-row">
        <SummaryCard label="Running" value={running} sub="Active A/B tests" color="#3b82f6" />
        <SummaryCard label="Winners Found" value={winners} sub="Statistically significant" color="#22c55e" />
        <SummaryCard
          label="Avg Uplift"
          value={`${avgUplift.toFixed(1)}%`}
          sub="Across winners"
          color="#22c55e"
        />
        <SummaryCard label="Revenue Lifted" value={revLifted} sub="Attributed to experiments" color="#22c55e" />
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "4px",
          background: "var(--surface)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
          width: "fit-content",
        }}
      >
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: "5px 14px",
                borderRadius: "var(--r-md)",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text-1)" : "var(--text-3)",
                background: active ? "var(--surface-raised)" : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              {tab.label}
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 10,
                  color: active ? "var(--accent-text)" : "var(--text-3)",
                  fontWeight: 700,
                }}
              >
                {tab.key === "all"
                  ? experiments.length
                  : experiments.filter((e) => e.status === tab.key).length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Experiment list */}
      {filtered.length === 0 ? (
        <EmptyState message={`No ${filter} experiments`} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((exp) => (
            <ExperimentCard
              key={exp.id}
              exp={exp}
              onSelect={(id) => onSelectExperiment?.(id)}
              onPromote={handlePromote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Variant Table ─── */

function VariantTable({
  variants,
  winner,
  status,
}: {
  variants: ExperimentVariant[];
  winner?: string;
  status: ExperimentStatus;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Variant", "Visits", "Conversions", "Rate", "Uplift", "Confidence"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "8px 10px",
                  textAlign: h === "Variant" ? "left" : "right",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {variants.map((v, i) => {
            const isControl = v.id === "control" || i === 0;
            const isWinner = winner && v.id === winner;
            const rowBg = isWinner ? "rgba(34,197,94,0.06)" : "transparent";
            const estimatedConversions =
              v.sampleSize > 0 ? Math.round((v.sampleSize * v.value) / 100) : 0;

            return (
              <tr
                key={v.id}
                style={{
                  background: rowBg,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <td style={{ padding: "10px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{v.name}</span>
                    {isControl && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "var(--text-3)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "1px 5px",
                          border: "1px solid var(--border)",
                          borderRadius: 3,
                        }}
                      >
                        Control
                      </span>
                    )}
                    {isWinner && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#22c55e",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "1px 5px",
                          background: "rgba(34,197,94,0.1)",
                          border: "1px solid rgba(34,197,94,0.3)",
                          borderRadius: 3,
                        }}
                      >
                        Winner
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--text-2)" }}>
                  {status === "pending" ? "—" : v.sampleSize.toLocaleString()}
                </td>
                <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--text-2)" }}>
                  {status === "pending" ? "—" : estimatedConversions.toLocaleString()}
                </td>
                <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 600, color: "var(--text-1)" }}>
                  {status === "pending" ? "—" : `${v.value.toFixed(2)}%`}
                </td>
                <td
                  style={{
                    padding: "10px 10px",
                    textAlign: "right",
                    fontWeight: 700,
                    color:
                      v.uplift === 0
                        ? "var(--text-3)"
                        : v.uplift > 0
                        ? "#22c55e"
                        : "#ef4444",
                  }}
                >
                  {fmtUplift(v.uplift)}
                </td>
                <td style={{ padding: "10px 10px", textAlign: "right" }}>
                  <span style={{ fontWeight: 700, color: confidenceColor(v.confidence) }}>
                    {status === "pending" ? "—" : `${v.confidence}%`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Statistical Significance Indicator ─── */

function SignificanceIndicator({ confidence }: { confidence: number }) {
  const level =
    confidence >= 95
      ? { label: "Statistically Significant", color: "#22c55e", bars: 3 }
      : confidence >= 80
      ? { label: "Approaching Significance", color: "#eab308", bars: 2 }
      : confidence > 0
      ? { label: "Not Yet Significant", color: "#ef4444", bars: 1 }
      : { label: "No Data", color: "var(--text-3)", bars: 0 };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: `${level.color}0d`,
        border: `1px solid ${level.color}33`,
        borderRadius: "var(--r-md)",
      }}
    >
      <div style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            style={{
              width: 6,
              height: 14,
              borderRadius: 2,
              background: bar <= level.bars ? level.color : "var(--border)",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: level.color }}>{level.label}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
          {confidence > 0 ? `${confidence}% confidence` : "Experiment not started"}
        </div>
      </div>
    </div>
  );
}

/* ─── Decision Recommendation ─── */

function DecisionRecommendation({
  exp,
}: {
  exp: MockExp;
}) {
  const bestNonControl = exp.variants
    .filter((v) => v.id !== "control")
    .sort((a, b) => b.uplift - a.uplift)[0];

  let icon = "◈";
  let color = "var(--text-2)";
  let headline = "";
  let body = "";

  if (exp.status === "pending") {
    icon = "⊙";
    color = "var(--text-3)";
    headline = "Experiment Queued";
    body = `This experiment is scheduled to start on ${exp.startDate}. No recommendation available yet.`;
  } else if (exp.status === "winner" && bestNonControl) {
    icon = "✓";
    color = "#22c55e";
    headline = `Deploy "${bestNonControl.name}"`;
    body = `Confidence at ${bestNonControl.confidence}% with ${bestNonControl.uplift.toFixed(1)}% uplift on ${exp.metric}. Safe to promote and deprecate the control.`;
  } else if (exp.status === "loser" && bestNonControl) {
    icon = "✕";
    color = "#ef4444";
    headline = "Revert to Control";
    body = `Challenger performed ${Math.abs(bestNonControl.uplift).toFixed(1)}% worse than control at ${bestNonControl.confidence}% confidence. Keep control variant live.`;
  } else if (exp.status === "running" && bestNonControl) {
    if (bestNonControl.confidence >= 95) {
      icon = "◎";
      color = "#22c55e";
      headline = "Ready to Declare Winner";
      body = `Challenger shows ${bestNonControl.uplift.toFixed(1)}% uplift at ${bestNonControl.confidence}% confidence — threshold met. Consider stopping early.`;
    } else {
      icon = "⟳";
      color = "#eab308";
      headline = "Continue Running";
      body = `Confidence at ${bestNonControl.confidence}% — below 95% threshold. Extend experiment to gather more data before making a decision.`;
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px",
        background: `${color}0d`,
        border: `1px solid ${color}22`,
        borderRadius: "var(--r-lg)",
      }}
    >
      <span style={{ fontSize: 18, color, flexShrink: 0, lineHeight: 1.2 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 4 }}>{headline}</div>
        <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}

/* ─── ExperimentDetailPage ─── */

export function ExperimentDetailPage({
  experimentId,
  onBack,
}: {
  experimentId: string;
  onBack?: () => void;
}) {
  const exp = MOCK_EXPERIMENTS.find((e) => e.id === experimentId);

  const [stopping, setStopping] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [extending, setExtending] = useState(false);

  if (!exp) {
    return (
      <div className="re-page-content">
        <EmptyState message="Experiment not found" />
      </div>
    );
  }

  const bestVariant = exp.variants
    .filter((v) => v.id !== "control")
    .sort((a, b) => b.confidence - a.confidence)[0];

  const maxConf = bestVariant?.confidence ?? 0;

  async function handleStop() {
    setStopping(true);
    await new Promise((r) => setTimeout(r, 1000));
    setStopping(false);
  }

  async function handleDeclare() {
    setDeclaring(true);
    await new Promise((r) => setTimeout(r, 1200));
    setDeclaring(false);
  }

  async function handleExtend() {
    setExtending(true);
    await new Promise((r) => setTimeout(r, 800));
    setExtending(false);
  }

  const isRunning = exp.status === "running";
  const isCompleted = exp.status === "winner" || exp.status === "loser";

  return (
    <div className="re-page-content">
      {/* Back */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text-3)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            marginBottom: -4,
          }}
        >
          ← Back to Experiments
        </button>
      )}

      {/* Header */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-1)",
                  letterSpacing: "-0.03em",
                  margin: 0,
                }}
              >
                {exp.name}
              </h2>
              <span className={`re-exp-status ${statusClass(exp.status)}`}>{statusLabel(exp.status)}</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
              {exp.hypothesis}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { label: "Metric", val: exp.metric },
            { label: "Goal", val: exp.goal },
            { label: "Started", val: exp.startDate },
            exp.endDate ? { label: "Ended", val: exp.endDate } : { label: "Running", val: `${exp.daysRunning} days` },
          ].map((item) => (
            <div key={item.label}>
              <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Statistical significance */}
      <SignificanceIndicator confidence={maxConf} />

      {/* Variant table */}
      <Panel title="Variant Results" subtitle={`${exp.metric} comparison`}>
        <VariantTable variants={exp.variants} winner={exp.winner} status={exp.status} />
      </Panel>

      {/* Decision recommendation */}
      <Panel title="System Recommendation">
        <DecisionRecommendation exp={exp} />
      </Panel>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          padding: "14px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", alignSelf: "center", marginRight: 4 }}>
          Actions:
        </span>

        {/* Stop */}
        <button
          onClick={handleStop}
          disabled={stopping || !isRunning}
          style={{
            padding: "7px 16px",
            background: isRunning ? "rgba(239,68,68,0.08)" : "var(--surface-raised)",
            color: isRunning ? "#ef4444" : "var(--text-3)",
            border: `1px solid ${isRunning ? "rgba(239,68,68,0.25)" : "var(--border)"}`,
            borderRadius: "var(--r-md)",
            fontSize: 12,
            fontWeight: 600,
            cursor: isRunning && !stopping ? "pointer" : "not-allowed",
            opacity: stopping ? 0.6 : 1,
            transition: "all 0.15s",
          }}
        >
          {stopping ? "Stopping…" : "Stop Experiment"}
        </button>

        {/* Declare winner */}
        <button
          onClick={handleDeclare}
          disabled={declaring || !isRunning}
          style={{
            padding: "7px 16px",
            background: isRunning ? "rgba(34,197,94,0.08)" : "var(--surface-raised)",
            color: isRunning ? "#22c55e" : "var(--text-3)",
            border: `1px solid ${isRunning ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
            borderRadius: "var(--r-md)",
            fontSize: 12,
            fontWeight: 600,
            cursor: isRunning && !declaring ? "pointer" : "not-allowed",
            opacity: declaring ? 0.6 : 1,
            transition: "all 0.15s",
          }}
        >
          {declaring ? "Declaring…" : "Declare Winner"}
        </button>

        {/* Extend */}
        <button
          onClick={handleExtend}
          disabled={extending || isCompleted}
          style={{
            padding: "7px 16px",
            background: !isCompleted ? "rgba(59,130,246,0.08)" : "var(--surface-raised)",
            color: !isCompleted ? "#3b82f6" : "var(--text-3)",
            border: `1px solid ${!isCompleted ? "rgba(59,130,246,0.25)" : "var(--border)"}`,
            borderRadius: "var(--r-md)",
            fontSize: 12,
            fontWeight: 600,
            cursor: !isCompleted && !extending ? "pointer" : "not-allowed",
            opacity: extending ? 0.6 : 1,
            transition: "all 0.15s",
          }}
        >
          {extending ? "Extending…" : "Extend Duration"}
        </button>
      </div>
    </div>
  );
}
