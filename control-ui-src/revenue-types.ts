/**
 * Task Enterprise — Revenue Engine C2
 * Revenue-specific types + nav items
 */

/* ─── Domain Types ─── */

export type GoalStatus = "on-track" | "at-risk" | "behind" | "achieved";
export type DecisionAction = "increase" | "decrease" | "pause" | "launch" | "kill" | "hold";
export type LoopPhase = "PLAN" | "EXECUTE" | "TRACK" | "ANALYZE" | "DECIDE" | "ACT";
export type ExperimentStatus = "running" | "winner" | "loser" | "inconclusive" | "pending";
export type AgentStatus = "active" | "idle" | "error" | "paused";

export interface Goal {
  id: string;
  name: string;
  metric: string;
  target: number;
  current: number;
  unit: string;
  status: GoalStatus;
  deadline: string;
  progress: number; // 0-100
  trend: "up" | "down" | "flat";
  trendPct: number;
}

export interface MetricSnapshot {
  id: string;
  label: string;
  value: number;
  unit: string;
  delta: number;      // absolute change
  deltaPct: number;   // % change
  trend: "up" | "down" | "flat";
  timestamp: string;
  source: string;     // stripe | social | analytics | n8n
}

export interface Decision {
  id: string;
  timestamp: string;
  goal: string;
  action: DecisionAction;
  target: string;
  reason: string;
  confidence: number;   // 0-100
  impact: number;       // predicted $ or %
  impactUnit: string;
  score: number;        // decision scoring
  executed: boolean;
  result?: string;
}

export interface ActionFeedItem {
  id: string;
  timestamp: string;
  agent: string;
  type: "execute" | "monitor" | "alert" | "complete" | "verify";
  message: string;
  status: "success" | "pending" | "failed" | "running";
  linkedDecision?: string;
  linkedGoal?: string;
}

export interface LoopState {
  currentPhase: LoopPhase;
  lastRun: string;
  nextRun: string;
  cycleCount: number;
  isRunning: boolean;
  phaseProgress: number; // 0-100
  phases: Record<LoopPhase, { status: "done" | "active" | "pending"; duration?: number }>;
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  startDate: string;
  endDate?: string;
  metric: string;
  goal: string;
  winner?: string;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  value: number;
  uplift: number;
  confidence: number;
  sampleSize: number;
}

export interface SystemHealth {
  overall: "healthy" | "degraded" | "critical";
  components: Record<string, { status: "ok" | "warn" | "error"; latency?: number }>;
  uptime: number;
  lastAnomaly?: string;
}

export interface AgentPanel {
  name: string;
  role: string;
  status: AgentStatus;
  currentTask?: string;
  lastAction?: string;
  actionsToday: number;
}

/* ─── Revenue Nav Pages ─── */

export type RevenuePageKey =
  | "revenue-overview"
  | "revenue-goals"
  | "revenue-decisions"
  | "revenue-actions"
  | "revenue-loop"
  | "revenue-experiments"
  | "revenue-control"
  | "revenue-agents";

export const REVENUE_NAV: Array<{ key: RevenuePageKey; label: string; icon: string; section: string }> = [
  { key: "revenue-overview",     label: "Overview",       icon: "⬡", section: "" },
  { key: "revenue-goals",        label: "Goals",          icon: "◎", section: "" },
  { key: "revenue-decisions",    label: "Decisions",      icon: "◈", section: "" },
  { key: "revenue-actions",      label: "Action Feed",    icon: "≋", section: "" },
  { key: "revenue-loop",         label: "Loop",           icon: "⟳", section: "Intelligence" },
  { key: "revenue-experiments",  label: "Experiments",    icon: "⊕", section: "Intelligence" },
  { key: "revenue-agents",       label: "Agents",         icon: "◉", section: "Intelligence" },
  { key: "revenue-control",      label: "Control",        icon: "⊞", section: "Command" },
];

/* ─── API Client ─── */

const BASE = import.meta.env?.VITE_API_URL || "http://localhost:3001";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export const revenueApi = {
  goals:       () => apiFetch<Goal[]>("/api/goals"),
  metrics:     () => apiFetch<MetricSnapshot[]>("/api/metrics"),
  decisions:   (limit = 50) => apiFetch<Decision[]>(`/api/decisions?limit=${limit}`),
  actions:     (limit = 100) => apiFetch<ActionFeedItem[]>(`/api/actions?limit=${limit}`),
  loop:        () => apiFetch<LoopState>("/api/loop"),
  experiments: () => apiFetch<Experiment[]>("/api/experiments"),
  health:      () => apiFetch<SystemHealth>("/api/health"),
  agents:      () => apiFetch<AgentPanel[]>("/api/agents/status"),
  triggerLoop: () => apiFetch<{ ok: boolean; cycleId: string }>("/api/loop/trigger", { method: "POST" }),
  updateGoal:  (id: string, patch: Partial<Goal>) =>
    apiFetch<Goal>(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  toggleAuto:  (enabled: boolean) =>
    apiFetch<{ ok: boolean }>("/api/control/automation", { method: "POST", body: JSON.stringify({ enabled }) }),
};

/* ─── Helpers ─── */

export function goalStatusColor(s: GoalStatus): string {
  return { "on-track": "#22c55e", "at-risk": "#eab308", behind: "#ef4444", achieved: "#8b5cf6" }[s] ?? "#888";
}

export function decisionActionColor(a: DecisionAction): string {
  return { increase: "#22c55e", launch: "#22c55e", decrease: "#eab308", pause: "#eab308", kill: "#ef4444", hold: "#888" }[a] ?? "#888";
}

export function loopPhaseColor(p: LoopPhase): string {
  return { PLAN: "#3b82f6", EXECUTE: "#22c55e", TRACK: "#8b5cf6", ANALYZE: "#eab308", DECIDE: "#f97316", ACT: "#dc3545" }[p];
}

export function agentStatusColor(s: AgentStatus): string {
  return { active: "#22c55e", idle: "#555", error: "#ef4444", paused: "#eab308" }[s];
}

export function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtPct(n: number, decimals = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export function fmtRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
