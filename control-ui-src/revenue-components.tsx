/**
 * Task Enterprise — Revenue Engine C2
 * Shared component library
 */

import { type ReactNode } from "react";
import {
  type Goal, type MetricSnapshot, type Decision, type ActionFeedItem,
  type AgentPanel, type LoopPhase,
  goalStatusColor, decisionActionColor, agentStatusColor, loopPhaseColor,
  fmtCurrency, fmtPct, fmtRelative,
} from "./revenue-types";

/* ─── MetricCard ─── */

export function MetricCard({
  label, value, unit = "", delta, deltaPct, trend, source,
}: Pick<MetricSnapshot, "label" | "value" | "unit" | "delta" | "deltaPct" | "trend" | "source">) {
  const up = trend === "up";
  const down = trend === "down";
  const color = up ? "#22c55e" : down ? "#ef4444" : "#888";
  const arrow = up ? "↑" : down ? "↓" : "→";

  return (
    <div className="re-metric-card">
      <div className="re-metric-top">
        <span className="re-metric-label">{label}</span>
        <span className="re-metric-source">{source}</span>
      </div>
      <div className="re-metric-value">
        {unit === "$" ? fmtCurrency(value) : `${value.toLocaleString()}${unit}`}
      </div>
      <div className="re-metric-delta" style={{ color }}>
        {arrow} {fmtPct(deltaPct)} ({delta >= 0 ? "+" : ""}{unit === "$" ? fmtCurrency(delta) : delta.toFixed(1)}{unit !== "$" ? unit : ""})
      </div>
    </div>
  );
}

/* ─── GoalProgressBar ─── */

export function GoalProgressBar({ goal }: { goal: Goal }) {
  const color = goalStatusColor(goal.status);
  const pct = Math.min(100, goal.progress);

  return (
    <div className="re-goal-row">
      <div className="re-goal-top">
        <span className="re-goal-name">{goal.name}</span>
        <span className="re-goal-status" style={{ color }}>{goal.status.replace("-", " ")}</span>
      </div>
      <div className="re-goal-meta">
        <span className="re-goal-metric">{goal.metric}</span>
        <span className="re-goal-values">
          <span style={{ color }}>{goal.unit === "$" ? fmtCurrency(goal.current) : `${goal.current.toLocaleString()}${goal.unit}`}</span>
          <span className="re-goal-sep">/</span>
          <span className="re-goal-target">{goal.unit === "$" ? fmtCurrency(goal.target) : `${goal.target.toLocaleString()}${goal.unit}`}</span>
        </span>
      </div>
      <div className="re-progress-track">
        <div className="re-progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="re-goal-footer">
        <span className="re-goal-pct">{pct}%</span>
        <span className="re-goal-deadline">Due {goal.deadline}</span>
      </div>
    </div>
  );
}

/* ─── DecisionCard ─── */

export function DecisionCard({ d }: { d: Decision }) {
  const actionColor = decisionActionColor(d.action);

  return (
    <div className="re-decision-card">
      <div className="re-decision-head">
        <div className="re-decision-action" style={{ color: actionColor, borderColor: actionColor }}>
          {d.action.toUpperCase()}
        </div>
        <div className="re-decision-goal">{d.goal}</div>
        <div className="re-decision-time">{fmtRelative(d.timestamp)}</div>
      </div>
      <div className="re-decision-target">{d.target}</div>
      <div className="re-decision-reason">{d.reason}</div>
      <div className="re-decision-metrics">
        <ConfidenceBar value={d.confidence} />
        <div className="re-decision-impact">
          <span className="re-dim">Impact</span>
          <span style={{ color: d.impact > 0 ? "#22c55e" : "#ef4444" }}>
            {d.impactUnit === "$" ? fmtCurrency(d.impact) : `${fmtPct(d.impact)} ${d.impactUnit}`}
          </span>
        </div>
        <div className="re-decision-score">
          <span className="re-dim">Score</span>
          <span className="re-score-val">{d.score.toFixed(0)}</span>
        </div>
        {d.executed && (
          <div className="re-decision-badge" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
            ✓ Executed
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── ConfidenceBar ─── */

export function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "#22c55e" : value >= 60 ? "#eab308" : "#ef4444";
  return (
    <div className="re-confidence">
      <span className="re-dim">Conf</span>
      <div className="re-conf-track">
        <div className="re-conf-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: 11 }}>{value}%</span>
    </div>
  );
}

/* ─── ActionFeedItem ─── */

const ACTION_ICONS: Record<string, string> = {
  execute: "▶", monitor: "◉", alert: "⚠", complete: "✓", verify: "⊕",
};
const ACTION_COLORS: Record<string, string> = {
  success: "#22c55e", pending: "#888", failed: "#ef4444", running: "#3b82f6",
};

export function ActionFeedItem({ item }: { item: ActionFeedItem }) {
  const color = ACTION_COLORS[item.status];
  const icon = ACTION_ICONS[item.type] ?? "·";
  const agentColor = AGENT_COLORS[item.agent] ?? "#888";

  return (
    <div className="re-feed-item">
      <div className="re-feed-icon" style={{ color }}>{icon}</div>
      <div className="re-feed-body">
        <div className="re-feed-top">
          <span className="re-feed-agent" style={{ color: agentColor }}>{item.agent}</span>
          <span className="re-feed-msg">{item.message}</span>
        </div>
        <div className="re-feed-meta">
          <span className="re-feed-status" style={{ color }}>{item.status}</span>
          <span className="re-dim">·</span>
          <span className="re-dim">{fmtRelative(item.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

const AGENT_COLORS: Record<string, string> = {
  Abdi: "#dc3545", Dame: "#3b82f6", Ayub: "#22c55e", Rex: "#8b5cf6",
  Atlas: "#f97316", Prime: "#eab308", Ahmed: "#06b6d4", Sygma: "#ec4899",
};

/* ─── AgentStatusPanel ─── */

export function AgentStatusPanel({ agents }: { agents: AgentPanel[] }) {
  return (
    <div className="re-agent-grid">
      {agents.map((a) => {
        const sc = agentStatusColor(a.status);
        const ac = AGENT_COLORS[a.name] ?? "#888";
        return (
          <div className="re-agent-card" key={a.name}>
            <div className="re-agent-head">
              <div className="re-agent-dot" style={{ background: sc }} />
              <span className="re-agent-name" style={{ color: ac }}>{a.name}</span>
              <span className="re-agent-status" style={{ color: sc }}>{a.status}</span>
            </div>
            <div className="re-agent-role">{a.role}</div>
            {a.currentTask && <div className="re-agent-task">{a.currentTask}</div>}
            <div className="re-agent-count">{a.actionsToday} actions today</div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── LoopPhaseNode ─── */

export function LoopPhaseNode({
  phase, status, isActive, duration,
}: {
  phase: LoopPhase;
  status: "done" | "active" | "pending";
  isActive: boolean;
  duration?: number;
}) {
  const color = loopPhaseColor(phase);
  const opacity = status === "pending" ? 0.3 : 1;

  return (
    <div className="re-loop-node" style={{ opacity }}>
      <div
        className={`re-loop-circle ${isActive ? "re-loop-active" : ""}`}
        style={{ borderColor: color, boxShadow: isActive ? `0 0 16px ${color}40` : "none" }}
      >
        <span style={{ color, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>{phase}</span>
        {status === "done" && <span className="re-loop-check">✓</span>}
        {isActive && <div className="re-loop-pulse" style={{ background: color }} />}
      </div>
      {duration !== undefined && (
        <span className="re-loop-dur">{duration}s</span>
      )}
    </div>
  );
}

/* ─── Panel wrapper ─── */

export function Panel({
  title, subtitle, action, className = "", children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`re-panel ${className}`}>
      <div className="re-panel-head">
        <div className="re-panel-title-group">
          <h3 className="re-panel-title">{title}</h3>
          {subtitle && <span className="re-panel-sub">{subtitle}</span>}
        </div>
        {action && <div className="re-panel-action">{action}</div>}
      </div>
      <div className="re-panel-body">{children}</div>
    </div>
  );
}

/* ─── System Health Indicator ─── */

export function HealthBadge({ status }: { status: "healthy" | "degraded" | "critical" }) {
  const map = { healthy: ["#22c55e", "●"], degraded: ["#eab308", "●"], critical: ["#ef4444", "●"] };
  const [color, icon] = map[status];
  return (
    <span className="re-health-badge" style={{ color }}>
      {icon} {status}
    </span>
  );
}

/* ─── Empty state ─── */

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="re-empty">
      <span className="re-empty-icon">◌</span>
      <span className="re-empty-msg">{message}</span>
    </div>
  );
}

/* ─── Skeleton loader ─── */

export function SkeletonBlock({ h = 40, w = "100%" }: { h?: number; w?: string }) {
  return <div className="re-skeleton" style={{ height: h, width: w }} />;
}
