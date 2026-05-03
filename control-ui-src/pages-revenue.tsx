/**
 * Task Enterprise — Revenue Engine C2
 * PHASE 2: Page Components
 *
 * Pages:
 *   RevenueOverviewPage  — metrics row + two-column (goals + decisions) + action feed
 *   GoalsPage            — status summary row + full goals list with inline edit
 *   MetricsPage          — source-filtered grid + CSS-only sparklines
 *   DecisionsPage        — filter bar + decision list + pagination
 */

import { useState, useCallback, useMemo } from "react";
import {
  type Goal,
  type MetricSnapshot,
  type Decision,
  type ActionFeedItem,
  type GoalStatus,
  type DecisionAction,
  goalStatusColor,
  decisionActionColor,
  fmtCurrency,
  fmtPct,
  fmtRelative,
  revenueApi,
} from "./revenue-types";
import {
  MetricCard,
  GoalProgressBar,
  DecisionCard,
  ActionFeedItem as ActionFeedItemComp,
  Panel,
  EmptyState,
  SkeletonBlock,
} from "./revenue-components";
import { TwoColumn, MetricsRow, PageContent } from "./revenue-shell";

/* ─── Mock Data ─── */

const MOCK_GOALS: Goal[] = [
  {
    id: "1",
    name: "Q2 MRR Target",
    metric: "Monthly Recurring Revenue",
    target: 55000,
    current: 48200,
    unit: "$",
    status: "on-track",
    deadline: "Jun 30",
    progress: 87.6,
    trend: "up",
    trendPct: 12.4,
  },
  {
    id: "2",
    name: "CAC Reduction",
    metric: "Customer Acquisition Cost",
    target: 350,
    current: 420,
    unit: "$",
    status: "at-risk",
    deadline: "May 31",
    progress: 54,
    trend: "down",
    trendPct: -3.2,
  },
  {
    id: "3",
    name: "Conversion Rate",
    metric: "Trial to Paid",
    target: 7,
    current: 6.2,
    unit: "%",
    status: "on-track",
    deadline: "Jun 30",
    progress: 88.6,
    trend: "up",
    trendPct: 6.3,
  },
  {
    id: "4",
    name: "Social Reach",
    metric: "Monthly Impressions",
    target: 200000,
    current: 82000,
    unit: "K",
    status: "behind",
    deadline: "Jun 30",
    progress: 41,
    trend: "up",
    trendPct: 4.1,
  },
];

const MOCK_METRICS: MetricSnapshot[] = [
  {
    id: "mrr",
    label: "MRR",
    value: 48200,
    unit: "$",
    delta: 5320,
    deltaPct: 12.4,
    trend: "up",
    timestamp: new Date().toISOString(),
    source: "stripe",
  },
  {
    id: "new-cust",
    label: "New Customers",
    value: 34,
    unit: "",
    delta: 2,
    deltaPct: 6.3,
    trend: "up",
    timestamp: new Date().toISOString(),
    source: "stripe",
  },
  {
    id: "churn",
    label: "Churn Rate",
    value: 1.8,
    unit: "%",
    delta: -0.3,
    deltaPct: -14.3,
    trend: "down",
    timestamp: new Date().toISOString(),
    source: "analytics",
  },
  {
    id: "ltv",
    label: "LTV",
    value: 3140,
    unit: "$",
    delta: 25,
    deltaPct: 0.8,
    trend: "flat",
    timestamp: new Date().toISOString(),
    source: "stripe",
  },
  {
    id: "cac",
    label: "CAC",
    value: 420,
    unit: "$",
    delta: -30,
    deltaPct: -6.7,
    trend: "down",
    timestamp: new Date().toISOString(),
    source: "stripe",
  },
  {
    id: "conv",
    label: "Conversion Rate",
    value: 6.2,
    unit: "%",
    delta: 0.4,
    deltaPct: 6.9,
    trend: "up",
    timestamp: new Date().toISOString(),
    source: "analytics",
  },
  {
    id: "reach",
    label: "Social Reach",
    value: 82000,
    unit: "",
    delta: 3200,
    deltaPct: 4.1,
    trend: "up",
    timestamp: new Date().toISOString(),
    source: "social",
  },
  {
    id: "pipeline",
    label: "Pipeline",
    value: 18,
    unit: "",
    delta: 3,
    deltaPct: 20,
    trend: "up",
    timestamp: new Date().toISOString(),
    source: "analytics",
  },
];

const MOCK_DECISIONS: Decision[] = [
  {
    id: "d1",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    goal: "Q2 MRR",
    action: "increase",
    target: "LinkedIn ad spend by 40%",
    reason:
      "Strong ROAS (4.2x) over 7-day window. Conversion rate above threshold. Historical pattern match confidence 0.84.",
    confidence: 84,
    impact: 2400,
    impactUnit: "$",
    score: 91,
    executed: true,
  },
  {
    id: "d2",
    timestamp: new Date(Date.now() - 1080000).toISOString(),
    goal: "CAC Reduction",
    action: "pause",
    target: "Google Search campaign B",
    reason:
      "CAC from this channel ($680) exceeds goal target by 94%. CTR anomaly detected. CPC increased 2.1x with no conversion improvement.",
    confidence: 76,
    impact: 1200,
    impactUnit: "$",
    score: 78,
    executed: true,
  },
  {
    id: "d3",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    goal: "Social Reach",
    action: "launch",
    target: "TikTok content series — 'Behind the AI'",
    reason:
      "Organic engagement on recent AI content 3.4x above average. Low cost, high potential reach. Experiment proposed by Atlas.",
    confidence: 62,
    impact: 45000,
    impactUnit: "reach",
    score: 67,
    executed: false,
  },
  {
    id: "d4",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    goal: "Conversion Rate",
    action: "increase",
    target: "Email nurture sequence frequency from 1/week to 3/week",
    reason:
      "A/B test variant showing +34% open rate. Conversion correlation strong. Winner variant confirmed.",
    confidence: 88,
    impact: 1100,
    impactUnit: "$",
    score: 86,
    executed: true,
  },
];

const MOCK_ACTIONS: ActionFeedItem[] = [
  {
    id: "a1",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    agent: "Abdi",
    type: "complete",
    message: "Approved decision: increase LinkedIn spend by 40%",
    status: "success",
  },
  {
    id: "a2",
    timestamp: new Date(Date.now() - 180000).toISOString(),
    agent: "Atlas",
    type: "execute",
    message: "Executing LinkedIn budget update via n8n automation",
    status: "running",
  },
  {
    id: "a3",
    timestamp: new Date(Date.now() - 1080000).toISOString(),
    agent: "Rex",
    type: "alert",
    message: "Anomaly detected: Google Search CTR dropped 31% in 2h window",
    status: "pending",
  },
  {
    id: "a4",
    timestamp: new Date(Date.now() - 1320000).toISOString(),
    agent: "Prime",
    type: "monitor",
    message: "Metrics ingested: Stripe, Analytics, Social — 847 data points",
    status: "success",
  },
  {
    id: "a5",
    timestamp: new Date(Date.now() - 1500000).toISOString(),
    agent: "Abdi",
    type: "verify",
    message: "Decision scored: Pause Google Search campaign B → score 78",
    status: "success",
  },
];

/* ─── Shared mini helpers ─── */

function StatusPill({ status }: { status: GoalStatus }) {
  const color = goalStatusColor(status);
  const label = status.replace("-", " ");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}

function ActionPill({ action }: { action: DecisionAction }) {
  const color = decisionActionColor(action);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {action}
    </span>
  );
}

/* ─── CSS-only Sparkline ─── */

/** Renders a 7-bar mini sparkline as inline flexbox bars — no external libs. */
function Sparkline({
  trend,
  deltaPct,
}: {
  trend: "up" | "down" | "flat";
  deltaPct: number;
}) {
  const color =
    trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#555";

  // Generate 7 pseudo-random-looking heights seeded on deltaPct
  const seed = Math.abs(deltaPct * 13.7);
  const bars = Array.from({ length: 7 }, (_, i) => {
    const base = 30 + ((seed * (i + 1) * 17) % 50);
    const bump =
      trend === "up"
        ? i * (30 / 6)
        : trend === "down"
        ? (6 - i) * (30 / 6)
        : 0;
    return Math.min(100, Math.max(10, base + bump));
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 2,
        height: 28,
        padding: "0 2px",
      }}
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: `${h}%`,
            background: color,
            borderRadius: "1px 1px 0 0",
            opacity: 0.3 + (i / 6) * 0.7,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Score Ring (CSS-only circular score indicator) ─── */

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
  const r = 16;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;

  return (
    <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color,
        }}
      >
        {score}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE 1 — RevenueOverviewPage
   ═══════════════════════════════════════════════════════════════ */

export function RevenueOverviewPage({ data }: { data?: any }) {
  const goals: Goal[] = data?.goals ?? MOCK_GOALS;
  const metrics: MetricSnapshot[] = data?.metrics ?? MOCK_METRICS;
  const decisions: Decision[] = data?.decisions ?? MOCK_DECISIONS;
  const actions: ActionFeedItem[] = data?.actions ?? MOCK_ACTIONS;

  // Top-4 key metrics for the overview row
  const topMetrics = metrics.filter((m) =>
    ["mrr", "new-cust", "churn", "conv"].includes(m.id)
  );

  return (
    <PageContent>
      {/* Metrics row */}
      <MetricsRow>
        {topMetrics.map((m) => (
          <MetricCard
            key={m.id}
            label={m.label}
            value={m.value}
            unit={m.unit}
            delta={m.delta}
            deltaPct={m.deltaPct}
            trend={m.trend}
            source={m.source}
          />
        ))}
      </MetricsRow>

      {/* Two-column: goals + recent decisions */}
      <TwoColumn
        ratio="60/40"
        left={
          <Panel
            title="Revenue Goals"
            subtitle={`${goals.filter((g) => g.status === "on-track").length} on track · ${goals.filter((g) => g.status === "at-risk").length} at risk`}
            action={
              <span style={{ fontSize: 11, color: "#dc3545", cursor: "pointer" }}>
                View all →
              </span>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {goals.map((g) => (
                <GoalProgressBar key={g.id} goal={g} />
              ))}
            </div>
          </Panel>
        }
        right={
          <Panel
            title="Recent Decisions"
            subtitle={`${decisions.filter((d) => d.executed).length} executed`}
            action={
              <span style={{ fontSize: 11, color: "#dc3545", cursor: "pointer" }}>
                View all →
              </span>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {decisions.slice(0, 3).map((d) => (
                <RecentDecisionRow key={d.id} d={d} />
              ))}
            </div>
          </Panel>
        }
      />

      {/* Action feed full-width */}
      <Panel
        title="Action Feed"
        subtitle="Live agent activity"
        action={
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: "rgba(34,197,94,0.1)",
              color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.3)",
            }}
          >
            ● Live
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {actions.map((item) => (
            <ActionFeedItemComp key={item.id} item={item} />
          ))}
        </div>
      </Panel>
    </PageContent>
  );
}

export const RevenueDashboardPage = RevenueOverviewPage;

/** Compact decision row for the overview panel */
function RecentDecisionRow({ d }: { d: Decision }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <ScoreRing score={d.score} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 3,
          }}
        >
          <ActionPill action={d.action} />
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              marginLeft: "auto",
            }}
          >
            {fmtRelative(d.timestamp)}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.85)",
            lineHeight: 1.4,
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {d.target}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
          }}
        >
          {d.goal} ·{" "}
          {d.impactUnit === "$"
            ? fmtCurrency(d.impact)
            : `${d.impact.toLocaleString()} ${d.impactUnit}`}{" "}
          projected
        </div>
      </div>
      {d.executed && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#22c55e",
            flexShrink: 0,
          }}
        >
          ✓
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE 2 — GoalsPage
   ═══════════════════════════════════════════════════════════════ */

export function GoalsPage({ data }: { data?: any }) {
  const [goals, setGoals] = useState<Goal[]>(data?.goals ?? MOCK_GOALS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<GoalStatus, number> = {
      "on-track": 0,
      "at-risk": 0,
      behind: 0,
      achieved: 0,
    };
    goals.forEach((g) => c[g.status]++);
    return c;
  }, [goals]);

  const handleExpand = useCallback(
    (goal: Goal) => {
      if (expandedId === goal.id) {
        setExpandedId(null);
        setSaveError(null);
      } else {
        setExpandedId(goal.id);
        setEditTarget(String(goal.target));
        setSaveError(null);
      }
    },
    [expandedId]
  );

  const handleSave = useCallback(
    async (goal: Goal) => {
      const newTarget = parseFloat(editTarget);
      if (isNaN(newTarget) || newTarget <= 0) {
        setSaveError("Enter a valid positive number");
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        // Attempt real API call; fall back to local update on failure
        const updated = await revenueApi
          .updateGoal(goal.id, { target: newTarget })
          .catch(() => null);
        const patch: Goal = updated ?? {
          ...goal,
          target: newTarget,
          progress: Math.min(100, (goal.current / newTarget) * 100),
        };
        setGoals((prev) => prev.map((g) => (g.id === goal.id ? patch : g)));
        setExpandedId(null);
      } catch {
        setSaveError("Save failed — try again");
      } finally {
        setSaving(false);
      }
    },
    [editTarget]
  );

  const STATUS_LABELS: Record<GoalStatus, string> = {
    "on-track": "On Track",
    "at-risk": "At Risk",
    behind: "Behind",
    achieved: "Achieved",
  };

  return (
    <PageContent>
      {/* Status summary row — 4 cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}
      >
        {(["on-track", "at-risk", "behind", "achieved"] as GoalStatus[]).map(
          (s) => {
            const color = goalStatusColor(s);
            const count = counts[s];
            return (
              <div
                key={s}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${color}30`,
                  borderRadius: 8,
                  padding: "14px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color,
                    lineHeight: 1,
                  }}
                >
                  {count}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: `${color}99`,
                  }}
                >
                  {STATUS_LABELS[s]}
                </span>
              </div>
            );
          }
        )}
      </div>

      {/* Goals list */}
      <Panel
        title="All Goals"
        subtitle={`${goals.length} targets tracked`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {goals.map((goal, idx) => {
            const isExpanded = expandedId === goal.id;
            const statusColor = goalStatusColor(goal.status);
            return (
              <div key={goal.id}>
                {/* Goal row */}
                <div
                  onClick={() => handleExpand(goal)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 0",
                    borderBottom:
                      !isExpanded && idx < goals.length - 1
                        ? "1px solid rgba(255,255,255,0.05)"
                        : "none",
                    cursor: "pointer",
                    userSelect: "none",
                    transition: "background 0.15s",
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleExpand(goal)}
                >
                  {/* Progress ring */}
                  <ProgressRing pct={goal.progress} color={statusColor} />

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "rgba(255,255,255,0.9)",
                        }}
                      >
                        {goal.name}
                      </span>
                      <StatusPill status={goal.status} />
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.4)",
                        marginBottom: 8,
                      }}
                    >
                      {goal.metric} · Due {goal.deadline}
                    </div>
                    {/* Progress bar */}
                    <div
                      style={{
                        height: 4,
                        background: "rgba(255,255,255,0.08)",
                        borderRadius: 2,
                        overflow: "hidden",
                        maxWidth: 400,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, goal.progress)}%`,
                          background: statusColor,
                          borderRadius: 2,
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>

                  {/* Right side: values */}
                  <div
                    style={{
                      textAlign: "right",
                      flexShrink: 0,
                      minWidth: 120,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: statusColor,
                        marginBottom: 2,
                      }}
                    >
                      {goal.unit === "$"
                        ? fmtCurrency(goal.current)
                        : `${goal.current.toLocaleString()}${goal.unit}`}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.35)",
                      }}
                    >
                      of{" "}
                      {goal.unit === "$"
                        ? fmtCurrency(goal.target)
                        : `${goal.target.toLocaleString()}${goal.unit}`}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: goal.trendPct >= 0 ? "#22c55e" : "#ef4444",
                        marginTop: 2,
                      }}
                    >
                      {goal.trendPct >= 0 ? "↑" : "↓"}{" "}
                      {Math.abs(goal.trendPct)}%
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <div
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      fontSize: 12,
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    ▾
                  </div>
                </div>

                {/* Inline edit row */}
                {isExpanded && (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${statusColor}30`,
                      borderRadius: 8,
                      padding: "16px 20px",
                      marginBottom: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      Edit Goal Target
                    </div>

                    {/* Stat boxes */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 12,
                        marginBottom: 4,
                      }}
                    >
                      <GoalStatBox
                        label="Current"
                        value={
                          goal.unit === "$"
                            ? fmtCurrency(goal.current)
                            : `${goal.current.toLocaleString()}${goal.unit}`
                        }
                        color={statusColor}
                      />
                      <GoalStatBox
                        label="Progress"
                        value={`${goal.progress.toFixed(1)}%`}
                        color={statusColor}
                      />
                      <GoalStatBox
                        label="Gap"
                        value={
                          goal.unit === "$"
                            ? fmtCurrency(
                                Math.abs(goal.target - goal.current)
                              )
                            : `${Math.abs(
                                goal.target - goal.current
                              ).toLocaleString()}${goal.unit}`
                        }
                        color="rgba(255,255,255,0.5)"
                      />
                    </div>

                    {/* Edit input + actions */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <label
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.5)",
                          flexShrink: 0,
                        }}
                      >
                        New target ({goal.unit || "value"}):
                      </label>
                      <input
                        type="number"
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          background: "rgba(255,255,255,0.06)",
                          border: `1px solid ${
                            saveError
                              ? "#ef4444"
                              : "rgba(255,255,255,0.15)"
                          }`,
                          borderRadius: 6,
                          padding: "8px 12px",
                          fontSize: 14,
                          color: "#fff",
                          outline: "none",
                          fontFamily: "inherit",
                          maxWidth: 200,
                        }}
                        placeholder={String(goal.target)}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSave(goal);
                        }}
                        disabled={saving}
                        style={{
                          padding: "8px 16px",
                          background: saving
                            ? "rgba(220,53,69,0.4)"
                            : "#dc3545",
                          border: "none",
                          borderRadius: 6,
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: saving ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                          letterSpacing: "0.04em",
                          transition: "background 0.15s",
                        }}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(null);
                          setSaveError(null);
                        }}
                        style={{
                          padding: "8px 14px",
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 6,
                          color: "rgba(255,255,255,0.5)",
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Cancel
                      </button>
                    </div>

                    {saveError && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#ef4444",
                          marginTop: -4,
                        }}
                      >
                        {saveError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {goals.length === 0 && (
            <EmptyState message="No goals configured yet." />
          )}
        </div>
      </Panel>
    </PageContent>
  );
}

/** Small circular SVG progress ring */
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const fill = (Math.min(100, pct) / 100) * circ;
  return (
    <div style={{ flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="3"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
        />
        <text
          x="22"
          y="22"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9"
          fontWeight="700"
          fill={color}
          fontFamily="Inter, sans-serif"
        >
          {Math.round(pct)}%
        </text>
      </svg>
    </div>
  );
}

function GoalStatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 6,
        padding: "10px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.3)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE 3 — MetricsPage
   ═══════════════════════════════════════════════════════════════ */

type MetricSource = "all" | "stripe" | "analytics" | "social" | "n8n";

const SOURCE_TABS: { key: MetricSource; label: string }[] = [
  { key: "all", label: "All" },
  { key: "stripe", label: "Stripe" },
  { key: "analytics", label: "Analytics" },
  { key: "social", label: "Social" },
  { key: "n8n", label: "n8n" },
];

export function MetricsPage({ data }: { data?: any }) {
  const allMetrics: MetricSnapshot[] = data?.metrics ?? MOCK_METRICS;
  const [activeSource, setActiveSource] = useState<MetricSource>("all");

  const filtered = useMemo(() => {
    if (activeSource === "all") return allMetrics;
    return allMetrics.filter((m) => m.source === activeSource);
  }, [allMetrics, activeSource]);

  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = { all: allMetrics.length };
    allMetrics.forEach((m) => {
      c[m.source] = (c[m.source] ?? 0) + 1;
    });
    return c;
  }, [allMetrics]);

  return (
    <PageContent>
      {/* Source filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "4px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10,
          width: "fit-content",
        }}
      >
        {SOURCE_TABS.map((tab) => {
          const isActive = activeSource === tab.key;
          const count = sourceCounts[tab.key] ?? 0;
          const noData = count === 0 && tab.key !== "all";
          return (
            <button
              key={tab.key}
              onClick={() => !noData && setActiveSource(tab.key)}
              style={{
                padding: "7px 14px",
                borderRadius: 7,
                border: "none",
                background: isActive ? "#dc3545" : "transparent",
                color: isActive
                  ? "#fff"
                  : noData
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(255,255,255,0.55)",
                fontSize: 12,
                fontWeight: 600,
                cursor: noData ? "default" : "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: 5,
                letterSpacing: "0.02em",
              }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    background: isActive
                      ? "rgba(255,255,255,0.25)"
                      : "rgba(255,255,255,0.08)",
                    padding: "1px 5px",
                    borderRadius: 10,
                    color: isActive ? "#fff" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Metrics grid */}
      {filtered.length === 0 ? (
        <EmptyState message={`No metrics from source: ${activeSource}`} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((m) => (
            <MetricGridCard key={m.id} metric={m} />
          ))}
        </div>
      )}

      {/* Source breakdown panel */}
      <Panel title="Source Breakdown" subtitle="Metrics by integration">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {(["stripe", "analytics", "social", "n8n"] as const).map((src) => {
            const srcMetrics = allMetrics.filter((m) => m.source === src);
            const upCount = srcMetrics.filter((m) => m.trend === "up").length;
            const downCount = srcMetrics.filter(
              (m) => m.trend === "down"
            ).length;
            const isSelected = activeSource === src;
            return (
              <div
                key={src}
                onClick={() =>
                  srcMetrics.length > 0 &&
                  setActiveSource(isSelected ? "all" : src)
                }
                style={{
                  background: isSelected
                    ? "rgba(220,53,69,0.08)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${
                    isSelected
                      ? "rgba(220,53,69,0.3)"
                      : "rgba(255,255,255,0.07)"
                  }`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  cursor: srcMetrics.length > 0 ? "pointer" : "default",
                  transition: "all 0.15s",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: isSelected
                      ? "#dc3545"
                      : "rgba(255,255,255,0.4)",
                    marginBottom: 8,
                  }}
                >
                  {src}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.85)",
                    marginBottom: 4,
                  }}
                >
                  {srcMetrics.length}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.3)",
                    display: "flex",
                    gap: 8,
                  }}
                >
                  {upCount > 0 && (
                    <span style={{ color: "#22c55e" }}>↑ {upCount}</span>
                  )}
                  {downCount > 0 && (
                    <span style={{ color: "#ef4444" }}>↓ {downCount}</span>
                  )}
                  {srcMetrics.length === 0 && (
                    <span style={{ color: "rgba(255,255,255,0.2)" }}>
                      no data
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </PageContent>
  );
}

/** Enhanced metric card with sparkline for the metrics grid */
function MetricGridCard({ metric: m }: { metric: MetricSnapshot }) {
  const up = m.trend === "up";
  const down = m.trend === "down";
  const trendColor = up ? "#22c55e" : down ? "#ef4444" : "#555";
  const arrow = up ? "↑" : down ? "↓" : "→";
  const isPositive = m.delta >= 0;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Source tag */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.04)",
          padding: "2px 6px",
          borderRadius: 4,
        }}
      >
        {m.source}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.4)",
        }}
      >
        {m.label}
      </div>

      {/* Value + sparkline */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "rgba(255,255,255,0.9)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {m.unit === "$"
            ? fmtCurrency(m.value)
            : `${m.value.toLocaleString()}${m.unit}`}
        </div>
        <Sparkline trend={m.trend} deltaPct={m.deltaPct} />
      </div>

      {/* Delta */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
        }}
      >
        <span style={{ color: trendColor, fontWeight: 600 }}>
          {arrow} {Math.abs(m.deltaPct).toFixed(1)}%
        </span>
        <span style={{ color: "rgba(255,255,255,0.25)" }}>
          ({isPositive ? "+" : ""}
          {m.unit === "$"
            ? fmtCurrency(m.delta)
            : `${m.delta >= 0 ? "+" : ""}${m.delta.toFixed(1)}${m.unit}`}
          )
        </span>
      </div>

      {/* Trend bar */}
      <div
        style={{
          height: 2,
          background: "rgba(255,255,255,0.05)",
          borderRadius: 1,
          overflow: "hidden",
          marginTop: 2,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.abs(m.deltaPct) * 3)}%`,
            background: trendColor,
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE 4 — DecisionsPage
   ═══════════════════════════════════════════════════════════════ */

const DECISIONS_PER_PAGE = 10;

const ACTION_TYPES: Array<{ value: DecisionAction | "all"; label: string }> = [
  { value: "all", label: "All Actions" },
  { value: "increase", label: "Increase" },
  { value: "decrease", label: "Decrease" },
  { value: "pause", label: "Pause" },
  { value: "launch", label: "Launch" },
  { value: "kill", label: "Kill" },
  { value: "hold", label: "Hold" },
];

export function DecisionsPage({ data }: { data?: any }) {
  const allDecisions: Decision[] = data?.decisions ?? MOCK_DECISIONS;

  const [filterAction, setFilterAction] = useState<DecisionAction | "all">("all");
  const [filterGoal, setFilterGoal] = useState<string>("all");
  const [filterExecuted, setFilterExecuted] = useState<"all" | "executed" | "pending">("all");
  const [page, setPage] = useState(1);

  const goalOptions = useMemo(() => {
    const names = Array.from(new Set(allDecisions.map((d) => d.goal)));
    return [
      { value: "all", label: "All Goals" },
      ...names.map((n) => ({ value: n, label: n })),
    ];
  }, [allDecisions]);

  const filtered = useMemo(() => {
    return allDecisions.filter((d) => {
      if (filterAction !== "all" && d.action !== filterAction) return false;
      if (filterGoal !== "all" && d.goal !== filterGoal) return false;
      if (filterExecuted === "executed" && !d.executed) return false;
      if (filterExecuted === "pending" && d.executed) return false;
      return true;
    });
  }, [allDecisions, filterAction, filterGoal, filterExecuted]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / DECISIONS_PER_PAGE));
  const paginated = filtered.slice(
    (page - 1) * DECISIONS_PER_PAGE,
    page * DECISIONS_PER_PAGE
  );

  // Reset to page 1 whenever a filter changes
  const setActionFilter = useCallback((v: DecisionAction | "all") => {
    setFilterAction(v);
    setPage(1);
  }, []);
  const setGoalFilter = useCallback((v: string) => {
    setFilterGoal(v);
    setPage(1);
  }, []);
  const setExecFilter = useCallback((v: "all" | "executed" | "pending") => {
    setFilterExecuted(v);
    setPage(1);
  }, []);

  const hasActiveFilters =
    filterAction !== "all" || filterGoal !== "all" || filterExecuted !== "all";

  const selectStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    padding: "7px 28px 7px 12px",
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    cursor: "pointer",
    fontFamily: "inherit",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.3)'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
  };

  return (
    <PageContent>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.3)",
            marginRight: 4,
          }}
        >
          Filter
        </span>

        {/* Action type */}
        <select
          value={filterAction}
          onChange={(e) =>
            setActionFilter(e.target.value as DecisionAction | "all")
          }
          style={selectStyle}
        >
          {ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        {/* Goal */}
        <select
          value={filterGoal}
          onChange={(e) => setGoalFilter(e.target.value)}
          style={selectStyle}
        >
          {goalOptions.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>

        {/* Execution status */}
        <select
          value={filterExecuted}
          onChange={(e) =>
            setExecFilter(e.target.value as "all" | "executed" | "pending")
          }
          style={selectStyle}
        >
          <option value="all">All Status</option>
          <option value="executed">Executed</option>
          <option value="pending">Pending</option>
        </select>

        {/* Result count */}
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            marginLeft: "auto",
          }}
        >
          {filtered.length} decision{filtered.length !== 1 ? "s" : ""}
        </span>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilterAction("all");
              setFilterGoal("all");
              setFilterExecuted("all");
              setPage(1);
            }}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              color: "rgba(255,255,255,0.4)",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Decision list */}
      {paginated.length === 0 ? (
        <EmptyState message="No decisions match the current filters." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {paginated.map((d) => (
            <DecisionFullCard key={d.id} d={d} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "8px 0",
          }}
        >
          <PaginationBtn
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            label="← Prev"
          />
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <PaginationBtn
              key={p}
              onClick={() => setPage(p)}
              disabled={false}
              active={p === page}
              label={String(p)}
            />
          ))}
          <PaginationBtn
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            label="Next →"
          />
        </div>
      )}

      {/* Aggregate stats */}
      <DecisionStats decisions={allDecisions} filtered={filtered} />
    </PageContent>
  );
}

/** Full-detail expandable decision card */
function DecisionFullCard({ d }: { d: Decision }) {
  const [expanded, setExpanded] = useState(false);
  const confColor =
    d.confidence >= 80 ? "#22c55e" : d.confidence >= 60 ? "#eab308" : "#ef4444";
  const scoreColor =
    d.score >= 80 ? "#22c55e" : d.score >= 60 ? "#eab308" : "#ef4444";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          padding: "16px 18px",
          cursor: "pointer",
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
      >
        <ScoreRing score={d.score} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top line */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <ActionPill action={d.action} />
            <span
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.4)",
                fontWeight: 500,
              }}
            >
              {d.goal}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.25)",
                marginLeft: "auto",
              }}
            >
              {fmtRelative(d.timestamp)}
            </span>
          </div>

          {/* Target */}
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              marginBottom: 10,
              lineHeight: 1.4,
            }}
          >
            {d.target}
          </div>

          {/* Metrics row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            {/* Confidence bar */}
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 4,
                }}
              >
                Confidence
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    flex: 1,
                    height: 4,
                    background: "rgba(255,255,255,0.07)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${d.confidence}%`,
                      background: confColor,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: confColor,
                    minWidth: 32,
                  }}
                >
                  {d.confidence}%
                </span>
              </div>
            </div>

            {/* Impact */}
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 4,
                }}
              >
                Impact
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: d.impact > 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {d.impactUnit === "$"
                  ? fmtCurrency(d.impact)
                  : `${d.impact.toLocaleString()} ${d.impactUnit}`}
              </div>
            </div>

            {/* Score */}
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 4,
                }}
              >
                Score
              </div>
              <div
                style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}
              >
                {d.score}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  /100
                </span>
              </div>
            </div>

            {/* Executed badge */}
            <div style={{ textAlign: "right" }}>
              {d.executed ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "rgba(34,197,94,0.1)",
                    color: "#22c55e",
                    border: "1px solid rgba(34,197,94,0.25)",
                  }}
                >
                  ✓ Executed
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "rgba(234,179,8,0.1)",
                    color: "#eab308",
                    border: "1px solid rgba(234,179,8,0.25)",
                  }}
                >
                  ○ Pending
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expand chevron */}
        <div
          style={{
            color: "rgba(255,255,255,0.2)",
            fontSize: 12,
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          ▾
        </div>
      </div>

      {/* Expanded: reasoning */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "14px 18px",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.25)",
              marginBottom: 8,
            }}
          >
            Reasoning
          </div>
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {d.reason}
          </p>
          {d.result && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.25)",
                  marginBottom: 6,
                }}
              >
                Result
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "#22c55e",
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {d.result}
              </p>
            </div>
          )}
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            Decision ID: {d.id} · {new Date(d.timestamp).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationBtn({
  onClick,
  disabled,
  active,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 12px",
        background: active ? "#dc3545" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "#dc3545" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 6,
        color: disabled
          ? "rgba(255,255,255,0.2)"
          : active
          ? "#fff"
          : "rgba(255,255,255,0.6)",
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
        minWidth: 36,
      }}
    >
      {label}
    </button>
  );
}

/** Aggregate stats strip at the bottom of DecisionsPage */
function DecisionStats({
  decisions,
  filtered,
}: {
  decisions: Decision[];
  filtered: Decision[];
}) {
  const executedCount = decisions.filter((d) => d.executed).length;
  const avgConfidence =
    decisions.length > 0
      ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
      : 0;
  const avgScore =
    decisions.length > 0
      ? decisions.reduce((sum, d) => sum + d.score, 0) / decisions.length
      : 0;
  const totalImpact = decisions
    .filter((d) => d.impactUnit === "$")
    .reduce((sum, d) => sum + d.impact, 0);

  const stats: Array<{ label: string; value: string; color: string }> = [
    {
      label: "Total Decisions",
      value: String(decisions.length),
      color: "rgba(255,255,255,0.7)",
    },
    {
      label: "Executed",
      value: `${executedCount} / ${decisions.length}`,
      color: "#22c55e",
    },
    {
      label: "Avg Confidence",
      value: `${avgConfidence.toFixed(0)}%`,
      color: avgConfidence >= 75 ? "#22c55e" : "#eab308",
    },
    {
      label: "Avg Score",
      value: avgScore.toFixed(0),
      color: avgScore >= 75 ? "#22c55e" : "#eab308",
    },
    {
      label: "Total $ Impact",
      value: fmtCurrency(totalImpact),
      color: "#22c55e",
    },
    {
      label: "Filtered",
      value: String(filtered.length),
      color: "rgba(255,255,255,0.4)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 10,
        padding: "14px 18px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
      }}
    >
      {stats.map((s) => (
        <div key={s.label} style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: s.color,
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {s.value}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.25)",
            }}
          >
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
