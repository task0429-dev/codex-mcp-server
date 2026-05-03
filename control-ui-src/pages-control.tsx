/**
 * Task Enterprise — Revenue Engine C2
 * Phase 6: Control + Command Panel
 * Exports: ControlPage, GoalEditorPage
 */

import { useState, useRef, useCallback } from "react";
import type { Goal, GoalStatus } from "./revenue-types";
import { Panel, EmptyState } from "./revenue-components";
import { goalStatusColor } from "./revenue-types";

/* ─── Mock Health Data ─── */

interface HealthComponent {
  name: string;
  status: "ok" | "warn" | "error";
  latency: number;
  lastPing: string;
}

const MOCK_HEALTH: HealthComponent[] = [
  { name: "Goal Engine",        status: "ok",   latency: 12,  lastPing: "2s ago" },
  { name: "Metrics Pipeline",   status: "ok",   latency: 34,  lastPing: "5s ago" },
  { name: "Decision Engine",    status: "ok",   latency: 89,  lastPing: "2s ago" },
  { name: "Scheduler",          status: "warn", latency: 240, lastPing: "8s ago" },
  { name: "Analysis Engine",    status: "ok",   latency: 67,  lastPing: "3s ago" },
  { name: "Learning Loop",      status: "ok",   latency: 44,  lastPing: "4s ago" },
  { name: "Experiment Engine",  status: "ok",   latency: 28,  lastPing: "6s ago" },
  { name: "Execution Verifier", status: "ok",   latency: 55,  lastPing: "2s ago" },
];

/* ─── Mock System Events ─── */

interface SystemEvent {
  id: string;
  timestamp: string;
  type: "info" | "warn" | "error" | "success";
  message: string;
}

const MOCK_EVENTS: SystemEvent[] = [
  { id: "ev10", timestamp: "14:32:01", type: "success", message: "Loop cycle #214 completed — 3 decisions executed" },
  { id: "ev9",  timestamp: "14:31:44", type: "info",    message: "Metrics ingestion complete: 12 sources synced" },
  { id: "ev8",  timestamp: "14:31:12", type: "info",    message: "Experiment 'Pricing Page Layout' — sample threshold reached" },
  { id: "ev7",  timestamp: "14:30:58", type: "warn",    message: "Scheduler latency elevated: 240ms (threshold: 200ms)" },
  { id: "ev6",  timestamp: "14:29:33", type: "success", message: "Decision executed: LinkedIn budget +15% via Abdi" },
  { id: "ev5",  timestamp: "14:27:11", type: "info",    message: "Anomaly scan complete — no anomalies detected" },
  { id: "ev4",  timestamp: "14:22:05", type: "success", message: "Loop cycle #213 completed — 1 decision executed" },
  { id: "ev3",  timestamp: "14:20:14", type: "info",    message: "Learning feedback processed: 8 outcome signals" },
  { id: "ev2",  timestamp: "14:18:30", type: "warn",    message: "Low confidence decision held: score 62 below threshold 80" },
  { id: "ev1",  timestamp: "14:15:00", type: "error",   message: "Stripe webhook timeout — retry #1 scheduled" },
];

/* ─── Mock Goals for editor ─── */

const INITIAL_GOALS: Goal[] = [
  {
    id: "g1",
    name: "Q2 MRR Target",
    metric: "Monthly Recurring Revenue",
    target: 15000,
    current: 8420,
    unit: "$",
    status: "on-track",
    deadline: "2026-06-30",
    progress: 56,
    trend: "up",
    trendPct: 12.4,
  },
  {
    id: "g2",
    name: "CAC Reduction",
    metric: "Customer Acquisition Cost",
    target: 180,
    current: 214,
    unit: "$",
    status: "at-risk",
    deadline: "2026-06-30",
    progress: 38,
    trend: "down",
    trendPct: -4.2,
  },
  {
    id: "g3",
    name: "Trial Conversion Rate",
    metric: "Trial-to-Paid %",
    target: 12,
    current: 9.4,
    unit: "%",
    status: "on-track",
    deadline: "2026-06-30",
    progress: 78,
    trend: "up",
    trendPct: 6.1,
  },
];

/* ─── Styled Toggle ─── */

function Toggle({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 10,
        background: value ? "var(--accent)" : "var(--surface-raised)",
        border: `1px solid ${value ? "var(--accent)" : "var(--border)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s, border-color 0.2s",
        flexShrink: 0,
        padding: 0,
        outline: "none",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          transition: "transform 0.2s",
          transform: value ? "translateX(16px)" : "translateX(0)",
          display: "block",
        }}
      />
    </button>
  );
}

/* ─── Control Row ─── */

function ControlRow({
  label,
  sub,
  toggle,
  extra,
}: {
  label: string;
  sub?: string;
  toggle: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="re-control-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="re-control-label">{label}</div>
          {sub && <div className="re-control-sub">{sub}</div>}
        </div>
        {toggle}
      </div>
      {extra && <div style={{ paddingLeft: 0 }}>{extra}</div>}
    </div>
  );
}

/* ─── Segment Picker ─── */

function SegmentPicker<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        background: "var(--surface-raised)",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--border)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt}
          disabled={disabled}
          onClick={() => onChange(opt)}
          style={{
            padding: "3px 10px",
            borderRadius: "var(--r-md)",
            fontSize: 11,
            fontWeight: value === opt ? 700 : 500,
            color: value === opt ? "var(--text-1)" : "var(--text-3)",
            background: value === opt ? "var(--surface)" : "transparent",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "all 0.12s",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ─── Range Slider ─── */

function RangeSlider({
  min,
  max,
  value,
  onChange,
  disabled,
  label,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: disabled ? 0.4 : 1 }}>
      {label && (
        <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
          {label}
        </span>
      )}
      <div style={{ flex: 1, position: "relative" }}>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: "100%",
            appearance: "none",
            WebkitAppearance: "none",
            height: 4,
            borderRadius: 2,
            background: `linear-gradient(to right, var(--accent) ${pct}%, var(--surface-raised) ${pct}%)`,
            outline: "none",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text-1)",
          minWidth: 28,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Manual Action Button ─── */

function ManualButton({
  label,
  onClick,
  loading,
  danger = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  loading: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        width: "100%",
        padding: "9px 14px",
        textAlign: "left",
        fontSize: 13,
        fontWeight: 600,
        color: danger ? "#ef4444" : loading ? "var(--text-3)" : "var(--text-1)",
        background: danger
          ? "rgba(239,68,68,0.06)"
          : loading
          ? "var(--surface-raised)"
          : "var(--surface-raised)",
        border: `1px solid ${danger ? "rgba(239,68,68,0.2)" : "var(--border)"}`,
        borderRadius: "var(--r-md)",
        cursor: loading || disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>{loading ? "Working…" : label}</span>
      {loading && (
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            border: "2px solid var(--border)",
            borderTopColor: "var(--text-2)",
            borderRadius: "50%",
            animation: "re-spin 0.6s linear infinite",
          }}
        />
      )}
    </button>
  );
}

/* ─── Confirmation Modal ─── */

function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface)",
          border: `1px solid ${danger ? "rgba(239,68,68,0.4)" : "var(--border)"}`,
          borderRadius: "var(--r-lg)",
          padding: "24px",
          maxWidth: 400,
          width: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: danger ? "#ef4444" : "var(--text-1)",
            margin: "0 0 10px",
          }}
        >
          {title}
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 20px", lineHeight: 1.5 }}>
          {body}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "7px 18px",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "7px 18px",
              background: danger ? "rgba(239,68,68,0.15)" : "var(--accent)",
              border: `1px solid ${danger ? "rgba(239,68,68,0.4)" : "var(--accent)"}`,
              borderRadius: "var(--r-md)",
              fontSize: 12,
              fontWeight: 700,
              color: danger ? "#ef4444" : "#fff",
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Health Status Dot ─── */

function StatusDot({ status }: { status: "ok" | "warn" | "error" }) {
  const color = { ok: "#22c55e", warn: "#eab308", error: "#ef4444" }[status];
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        boxShadow: status !== "ok" ? `0 0 6px ${color}` : "none",
        flexShrink: 0,
      }}
    />
  );
}

/* ─── Health Grid ─── */

function HealthGrid({ components }: { components: HealthComponent[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 10,
      }}
    >
      {components.map((c) => (
        <div
          key={c.name}
          style={{
            background: "var(--surface-raised)",
            border: `1px solid ${c.status === "ok" ? "var(--border)" : c.status === "warn" ? "rgba(234,179,8,0.25)" : "rgba(239,68,68,0.25)"}`,
            borderRadius: "var(--r-md)",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <StatusDot status={c.status} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>{c.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              {c.latency}ms
            </span>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>ping {c.lastPing}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Event Log ─── */

const EVENT_COLORS: Record<SystemEvent["type"], string> = {
  info: "#3b82f6",
  warn: "#eab308",
  error: "#ef4444",
  success: "#22c55e",
};
const EVENT_ICONS: Record<SystemEvent["type"], string> = {
  info: "·",
  warn: "⚠",
  error: "✕",
  success: "✓",
};

function EventLog({ events }: { events: SystemEvent[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events.map((ev) => (
        <div
          key={ev.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "8px 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: EVENT_COLORS[ev.type],
              width: 14,
              textAlign: "center",
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {EVENT_ICONS[ev.type]}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, marginTop: 2, minWidth: 54 }}>
            {ev.timestamp}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1, lineHeight: 1.4 }}>
            {ev.message}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── ControlPage ─── */

interface AutomationState {
  autonomousLoop: boolean;
  cycleInterval: "5m" | "15m" | "30m" | "1h";
  autoExecute: boolean;
  scoreThreshold: number;
  anomalyAlerts: boolean;
  anomalySensitivity: "Low" | "Medium" | "High";
  experimentEngine: boolean;
  learningFeedback: boolean;
  socialPublishing: boolean;
}

export function ControlPage() {
  const [auto, setAuto] = useState<AutomationState>({
    autonomousLoop: true,
    cycleInterval: "15m",
    autoExecute: true,
    scoreThreshold: 80,
    anomalyAlerts: true,
    anomalySensitivity: "Medium",
    experimentEngine: true,
    learningFeedback: true,
    socialPublishing: false,
  });

  function setField<K extends keyof AutomationState>(key: K, val: AutomationState[K]) {
    setAuto((prev) => ({ ...prev, [key]: val }));
  }

  // Loading states
  const [loadingLoop, setLoadingLoop]       = useState(false);
  const [loadingIngest, setLoadingIngest]   = useState(false);
  const [loadingScan, setLoadingScan]       = useState(false);
  const [loadingClear, setLoadingClear]     = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showStopModal, setShowStopModal]   = useState(false);

  async function triggerLoop() {
    setLoadingLoop(true);
    await new Promise((r) => setTimeout(r, 1500));
    setLoadingLoop(false);
  }

  async function forceIngest() {
    setLoadingIngest(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoadingIngest(false);
  }

  async function runScan() {
    setLoadingScan(true);
    await new Promise((r) => setTimeout(r, 1000));
    setLoadingScan(false);
  }

  async function clearQueue() {
    setShowClearModal(false);
    setLoadingClear(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoadingClear(false);
  }

  function emergencyStop() {
    setShowStopModal(false);
    setAuto((prev) => ({
      ...prev,
      autonomousLoop: false,
      autoExecute: false,
      socialPublishing: false,
    }));
  }

  return (
    <>
      {/* CSS for spinner */}
      <style>{`@keyframes re-spin { to { transform: rotate(360deg); } }`}</style>

      <ConfirmModal
        open={showClearModal}
        title="Clear Decision Queue"
        body="This will remove all pending decisions from the execution queue. Decisions already executed will not be affected. This action cannot be undone."
        confirmLabel="Clear Queue"
        onConfirm={clearQueue}
        onCancel={() => setShowClearModal(false)}
      />

      <ConfirmModal
        open={showStopModal}
        title="Emergency Stop All"
        body="This will immediately halt the autonomous loop, disable auto-execution, and stop all social publishing. You will need to manually re-enable each system to resume operations."
        confirmLabel="Stop Everything"
        danger
        onConfirm={emergencyStop}
        onCancel={() => setShowStopModal(false)}
      />

      <div className="re-page-content">
        {/* Two-column layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            alignItems: "start",
          }}
          className="re-two-col"
        >
          {/* LEFT: Automation Toggles */}
          <Panel title="Automation" subtitle="Configure the autonomous loop">
            <div style={{ display: "flex", flexDirection: "column" }}>

              {/* Autonomous Loop */}
              <ControlRow
                label="Autonomous Loop"
                sub="Master switch — enables closed-loop execution"
                toggle={
                  <Toggle
                    value={auto.autonomousLoop}
                    onChange={(v) => setField("autonomousLoop", v)}
                  />
                }
                extra={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>Cycle interval:</span>
                    <SegmentPicker
                      options={["5m", "15m", "30m", "1h"] as const}
                      value={auto.cycleInterval}
                      onChange={(v) => setField("cycleInterval", v)}
                      disabled={!auto.autonomousLoop}
                    />
                  </div>
                }
              />

              {/* Auto-Execute */}
              <ControlRow
                label="Auto-Execute Decisions"
                sub="Automatically run decisions above score threshold"
                toggle={
                  <Toggle
                    value={auto.autoExecute}
                    onChange={(v) => setField("autoExecute", v)}
                    disabled={!auto.autonomousLoop}
                  />
                }
                extra={
                  <RangeSlider
                    min={50}
                    max={100}
                    value={auto.scoreThreshold}
                    onChange={(v) => setField("scoreThreshold", v)}
                    disabled={!auto.autoExecute || !auto.autonomousLoop}
                    label="Min score"
                  />
                }
              />

              {/* Anomaly Alerts */}
              <ControlRow
                label="Anomaly Alerts"
                sub="Detect and surface metric anomalies"
                toggle={
                  <Toggle
                    value={auto.anomalyAlerts}
                    onChange={(v) => setField("anomalyAlerts", v)}
                  />
                }
                extra={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>Sensitivity:</span>
                    <SegmentPicker
                      options={["Low", "Medium", "High"] as const}
                      value={auto.anomalySensitivity}
                      onChange={(v) => setField("anomalySensitivity", v)}
                      disabled={!auto.anomalyAlerts}
                    />
                  </div>
                }
              />

              {/* Experiment Engine */}
              <ControlRow
                label="Experiment Engine"
                sub="Run and evaluate A/B tests automatically"
                toggle={
                  <Toggle
                    value={auto.experimentEngine}
                    onChange={(v) => setField("experimentEngine", v)}
                  />
                }
              />

              {/* Learning Feedback */}
              <ControlRow
                label="Learning Feedback"
                sub="Feed outcomes back into the decision model"
                toggle={
                  <Toggle
                    value={auto.learningFeedback}
                    onChange={(v) => setField("learningFeedback", v)}
                  />
                }
              />

              {/* Social Publishing */}
              <ControlRow
                label="Social Publishing"
                sub="Allow agents to publish to LinkedIn / Twitter"
                toggle={
                  <Toggle
                    value={auto.socialPublishing}
                    onChange={(v) => setField("socialPublishing", v)}
                  />
                }
              />
            </div>
          </Panel>

          {/* RIGHT: Manual Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Panel title="Manual Controls" subtitle="Trigger system operations on demand">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ManualButton
                  label="Trigger Loop Now"
                  onClick={triggerLoop}
                  loading={loadingLoop}
                />
                <ManualButton
                  label="Force Metrics Ingestion"
                  onClick={forceIngest}
                  loading={loadingIngest}
                />
                <ManualButton
                  label="Run Anomaly Scan"
                  onClick={runScan}
                  loading={loadingScan}
                />
                <ManualButton
                  label="Clear Decision Queue"
                  onClick={() => setShowClearModal(true)}
                  loading={loadingClear}
                />
                <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <ManualButton
                    label="Emergency Stop All"
                    onClick={() => setShowStopModal(true)}
                    loading={false}
                    danger
                  />
                </div>
              </div>
            </Panel>
          </div>
        </div>

        {/* System Health */}
        <Panel title="System Health" subtitle="Component status and latency">
          <HealthGrid components={MOCK_HEALTH} />
        </Panel>

        {/* Event Log */}
        <Panel
          title="Recent Events"
          subtitle="Last 10 system events"
          action={
            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace" }}>
              live
              <span
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#22c55e",
                  marginLeft: 5,
                  verticalAlign: "middle",
                  animation: "re-pulse 1.5s infinite",
                }}
              />
            </span>
          }
        >
          <EventLog events={MOCK_EVENTS} />
        </Panel>
      </div>
    </>
  );
}

/* ─── Goal Editor Types ─── */

interface EditableGoal extends Goal {
  dirty: boolean;
}

type NewGoalForm = {
  name: string;
  metric: string;
  target: string;
  unit: string;
  deadline: string;
  status: GoalStatus;
};

/* ─── GoalEditorRow ─── */

function GoalEditorRow({
  goal,
  index,
  total,
  onChange,
  onSave,
  onReset,
  onMoveUp,
  onMoveDown,
}: {
  goal: EditableGoal;
  index: number;
  total: number;
  onChange: (patch: Partial<Goal>) => void;
  onSave: () => void;
  onReset: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const statusColor = goalStatusColor(goal.status);

  return (
    <div
      style={{
        background: "var(--surface-raised)",
        border: `1px solid ${goal.dirty ? "rgba(220,53,69,0.3)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "border-color 0.2s",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Priority arrows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move up"
            style={{
              width: 20,
              height: 18,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              cursor: index === 0 ? "not-allowed" : "pointer",
              opacity: index === 0 ? 0.3 : 1,
              fontSize: 9,
              color: "var(--text-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Move down"
            style={{
              width: 20,
              height: 18,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              cursor: index === total - 1 ? "not-allowed" : "pointer",
              opacity: index === total - 1 ? 0.3 : 1,
              fontSize: 9,
              color: "var(--text-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ▼
          </button>
        </div>

        {/* Priority badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-3)",
            width: 20,
            textAlign: "center",
          }}
        >
          #{index + 1}
        </span>

        {/* Goal name */}
        <input
          type="text"
          value={goal.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-1)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--border)",
            outline: "none",
            padding: "2px 0",
            fontFamily: "inherit",
          }}
        />

        {/* Status */}
        <select
          value={goal.status}
          onChange={(e) => onChange({ status: e.target.value as GoalStatus })}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: statusColor,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "3px 8px",
            cursor: "pointer",
            fontFamily: "inherit",
            outline: "none",
          }}
        >
          {(["on-track", "at-risk", "behind", "achieved"] as GoalStatus[]).map((s) => (
            <option key={s} value={s} style={{ color: goalStatusColor(s) }}>
              {s.replace("-", " ")}
            </option>
          ))}
        </select>

        {goal.dirty && (
          <span style={{ fontSize: 10, color: "var(--accent-text)", fontWeight: 600 }}>unsaved</span>
        )}
      </div>

      {/* Fields grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <GoalField
          label="Metric Name"
          value={goal.metric}
          onChange={(v) => onChange({ metric: v })}
        />
        <GoalField
          label="Target Value"
          value={String(goal.target)}
          type="number"
          onChange={(v) => onChange({ target: Number(v) })}
        />
        <GoalField
          label="Unit"
          value={goal.unit}
          onChange={(v) => onChange({ unit: v })}
          placeholder="$, %, count…"
        />
        <GoalField
          label="Deadline"
          value={goal.deadline}
          type="date"
          onChange={(v) => onChange({ deadline: v })}
        />
      </div>

      {/* Save / Reset */}
      {goal.dirty && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onReset}
            style={{
              padding: "5px 14px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            Reset
          </button>
          <button
            onClick={onSave}
            style={{
              padding: "5px 14px",
              background: "var(--accent)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--r-md)",
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Save Goal
          </button>
        </div>
      )}
    </div>
  );
}

function GoalField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number" | "date";
  placeholder?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-1)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: "6px 8px",
          outline: "none",
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

/* ─── New Goal Form ─── */

const EMPTY_NEW_GOAL: NewGoalForm = {
  name: "",
  metric: "",
  target: "",
  unit: "$",
  deadline: "2026-06-30",
  status: "on-track",
};

function NewGoalInlineForm({
  onAdd,
  onCancel,
}: {
  onAdd: (g: Omit<Goal, "current" | "progress" | "trend" | "trendPct">) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NewGoalForm>(EMPTY_NEW_GOAL);
  const [error, setError] = useState("");

  function handleSubmit() {
    if (!form.name.trim()) { setError("Goal name is required"); return; }
    if (!form.metric.trim()) { setError("Metric name is required"); return; }
    if (!form.target || isNaN(Number(form.target))) { setError("Target must be a number"); return; }
    setError("");
    onAdd({
      id: `g${Date.now()}`,
      name: form.name.trim(),
      metric: form.metric.trim(),
      target: Number(form.target),
      unit: form.unit.trim() || "$",
      deadline: form.deadline,
      status: form.status,
    });
  }

  return (
    <div
      style={{
        background: "var(--surface-raised)",
        border: "1px solid rgba(220,53,69,0.25)",
        borderRadius: "var(--r-lg)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>New Goal</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <GoalField label="Goal Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
        <GoalField label="Metric Name" value={form.metric} onChange={(v) => setForm((f) => ({ ...f, metric: v }))} />
        <GoalField label="Target Value" value={form.target} type="number" onChange={(v) => setForm((f) => ({ ...f, target: v }))} />
        <GoalField label="Unit" value={form.unit} onChange={(v) => setForm((f) => ({ ...f, unit: v }))} placeholder="$, %, count…" />
        <GoalField label="Deadline" value={form.deadline} type="date" onChange={(v) => setForm((f) => ({ ...f, deadline: v }))} />
        <div>
          <label
            style={{
              display: "block",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 4,
            }}
          >
            Initial Status
          </label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as GoalStatus }))}
            style={{
              width: "100%",
              fontSize: 13,
              color: "var(--text-1)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: "6px 8px",
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            {(["on-track", "at-risk", "behind", "achieved"] as GoalStatus[]).map((s) => (
              <option key={s} value={s}>{s.replace("-", " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 500 }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-2)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: "6px 16px",
            background: "var(--accent)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--r-md)",
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Add Goal
        </button>
      </div>
    </div>
  );
}

/* ─── GoalEditorPage ─── */

export function GoalEditorPage() {
  const [goals, setGoals] = useState<EditableGoal[]>(
    INITIAL_GOALS.map((g) => ({ ...g, dirty: false }))
  );
  const originals = useRef<Record<string, Goal>>(
    Object.fromEntries(INITIAL_GOALS.map((g) => [g.id, { ...g }]))
  );
  const [showNewForm, setShowNewForm] = useState(false);

  function updateGoal(id: string, patch: Partial<Goal>) {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...patch, dirty: true } : g))
    );
  }

  function saveGoal(id: string) {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        originals.current[id] = { ...g };
        return { ...g, dirty: false };
      })
    );
  }

  function resetGoal(id: string) {
    const orig = originals.current[id];
    if (!orig) return;
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...orig, dirty: false } : g))
    );
  }

  function moveGoal(index: number, direction: -1 | 1) {
    const newGoals = [...goals];
    const target = index + direction;
    if (target < 0 || target >= newGoals.length) return;
    [newGoals[index], newGoals[target]] = [newGoals[target], newGoals[index]];
    setGoals(newGoals);
  }

  function addGoal(data: Omit<Goal, "current" | "progress" | "trend" | "trendPct">) {
    const newGoal: EditableGoal = {
      ...data,
      current: 0,
      progress: 0,
      trend: "flat",
      trendPct: 0,
      dirty: false,
    };
    originals.current[newGoal.id] = { ...newGoal };
    setGoals((prev) => [...prev, newGoal]);
    setShowNewForm(false);
  }

  const dirtyCount = goals.filter((g) => g.dirty).length;

  return (
    <div className="re-page-content">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Goal Editor</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            {goals.length} goals · Drag to reorder priority
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {dirtyCount > 0 && (
            <span style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 600 }}>
              {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => setShowNewForm(true)}
            disabled={showNewForm}
            style={{
              padding: "7px 16px",
              background: showNewForm ? "var(--surface-raised)" : "var(--accent)",
              border: `1px solid ${showNewForm ? "var(--border)" : "var(--accent)"}`,
              borderRadius: "var(--r-md)",
              fontSize: 12,
              fontWeight: 700,
              color: showNewForm ? "var(--text-3)" : "#fff",
              cursor: showNewForm ? "not-allowed" : "pointer",
            }}
          >
            + Add New Goal
          </button>
        </div>
      </div>

      {/* Goal list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {goals.map((g, i) => (
          <GoalEditorRow
            key={g.id}
            goal={g}
            index={i}
            total={goals.length}
            onChange={(patch) => updateGoal(g.id, patch)}
            onSave={() => saveGoal(g.id)}
            onReset={() => resetGoal(g.id)}
            onMoveUp={() => moveGoal(i, -1)}
            onMoveDown={() => moveGoal(i, 1)}
          />
        ))}

        {/* New goal form */}
        {showNewForm && (
          <NewGoalInlineForm onAdd={addGoal} onCancel={() => setShowNewForm(false)} />
        )}

        {goals.length === 0 && !showNewForm && (
          <EmptyState message="No goals yet. Add your first goal above." />
        )}
      </div>
    </div>
  );
}
