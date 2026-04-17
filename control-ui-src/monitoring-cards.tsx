/* ─── Rex Command Zone — Group Command Cards ─── */

import { formatRelative } from './types';
import {
  healthColor, healthLabel,
  type ActionId, type Beat, type Connection, type MonitorGroup,
} from './data-monitoring';

// ── Beat Strip ───────────────────────────────────────────────────

function beatClass(b: Beat): string {
  switch (b) {
    case 'u': return 'rzm-beat rzm-beat-u';
    case 'd': return 'rzm-beat rzm-beat-d';
    case 'e': return 'rzm-beat rzm-beat-e';
    case 'p': return 'rzm-beat rzm-beat-p';
    case 'm': return 'rzm-beat rzm-beat-m';
  }
}

interface BeatStripProps {
  beats: Beat[];
  height?: number;
}

function BeatStrip({ beats, height = 18 }: BeatStripProps) {
  return (
    <div className="rzm-beats">
      {beats.map((b, i) => (
        <div
          key={i}
          className={beatClass(b)}
          style={{ height: b === 'e' ? Math.round(height * 0.3) : b === 'd' ? height : Math.round(height * 0.7) }}
        />
      ))}
    </div>
  );
}

// ── HealthPill ───────────────────────────────────────────────────

import { type HealthLevel } from './data-monitoring';

function HealthPill({ health }: { health: HealthLevel }) {
  return (
    <span className={`rzm-pill rzm-pill-${healthColor(health)}`}>
      {healthLabel(health)}
    </span>
  );
}

// ── Failing Connection Summary ───────────────────────────────────

function FailingItem({ conn }: { conn: Connection }) {
  const snippet = conn.failureReason
    ? conn.failureReason.slice(0, 80) + (conn.failureReason.length > 80 ? '…' : '')
    : 'Connection unreachable';
  return (
    <div className="rzm-card-failing">
      <span className="rzm-card-failing-icon">⚡</span>
      <span className="rzm-card-failing-name">{conn.name}</span>
      <span className="rzm-card-failing-reason"> — {snippet}</span>
    </div>
  );
}

// ── Action button with spinner ───────────────────────────────────

interface ActionBtnProps {
  label: string;
  icon?: string;
  variant?: 'ghost' | 'primary' | 'danger' | 'amber';
  running?: boolean;
  onClick: () => void;
}

function ActionBtn({ label, icon, variant = 'ghost', running = false, onClick }: ActionBtnProps) {
  return (
    <button
      className={`rzm-btn rzm-btn-${variant}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={running}
    >
      {running ? <span className="rzm-spinner" /> : icon ? <span>{icon}</span> : null}
      {label}
    </button>
  );
}

// ── GroupCommandCard ─────────────────────────────────────────────

interface GroupCommandCardProps {
  group: MonitorGroup;
  selected: boolean;
  onClick: () => void;
  onAction: (groupId: string, action: ActionId) => void;
  actionState: Record<string, 'idle' | 'running' | 'success' | 'error'>;
}

export function GroupCommandCard({ group, selected, onClick, onAction, actionState }: GroupCommandCardProps) {
  const hc = healthColor(group.health);
  const isDown = group.down > 0;
  const isDegraded = group.degraded > 0 && group.down === 0;

  const failingConns = group.connections.filter(c => c.uptime < 50 || c.failureReason);
  const topFailing = failingConns[0] ?? null;

  const restartKey = `${group.id}-restart`;
  const diagKey = `${group.id}-diag`;
  const isRestarting = actionState[restartKey] === 'running';
  const isDiagnosing = actionState[diagKey] === 'running';

  const uptimeColor = group.uptime >= 99 ? 'var(--rzm-green)' :
    group.uptime >= 95 ? 'var(--rzm-cyan)' :
    group.uptime >= 80 ? 'var(--rzm-amber)' : 'var(--rzm-red)';

  return (
    <div
      className={`rzm-group-card${selected ? ' selected' : ''}${isDown ? ' rzm-card-down' : ''}${isDegraded ? ' rzm-card-degraded' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      {/* Top accent bar */}
      <div className={`rzm-card-accent rzm-bg-${hc}`} />

      {/* Header row */}
      <div className="rzm-card-header">
        <span className="rzm-card-icon">{group.icon}</span>
        <span className="rzm-card-name">{group.displayName}</span>
        <div className="rzm-card-header-right">
          <HealthPill health={group.health} />
          {group.alerts > 0 && (
            <span className="rzm-card-alert-badge">{group.alerts}</span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="rzm-card-stats">
        <div className="rzm-card-stat">
          <span className="rzm-card-stat-num">{group.total}</span>
          <span className="rzm-card-stat-lbl">Total</span>
        </div>
        <div className="rzm-card-stat">
          <span className="rzm-card-stat-num" style={{ color: 'var(--rzm-green)' }}>{group.healthy}</span>
          <span className="rzm-card-stat-lbl">Healthy</span>
        </div>
        {group.degraded > 0 && (
          <div className="rzm-card-stat">
            <span className="rzm-card-stat-num" style={{ color: 'var(--rzm-amber)' }}>{group.degraded}</span>
            <span className="rzm-card-stat-lbl">Degraded</span>
          </div>
        )}
        {group.down > 0 && (
          <div className="rzm-card-stat">
            <span className="rzm-card-stat-num rzm-card-stat-down">{group.down}</span>
            <span className="rzm-card-stat-lbl">Down</span>
          </div>
        )}
      </div>

      {/* Beat strip */}
      <div className="rzm-card-beats">
        <BeatStrip beats={group.connections[0]?.beats ?? []} height={20} />
      </div>

      {/* Metrics row */}
      <div className="rzm-card-metrics">
        <div className="rzm-card-uptime" style={{ color: uptimeColor }}>
          {group.uptime.toFixed(2)}%
        </div>
        {group.avgResponseTime !== null && (
          <div className="rzm-card-metric-item">
            <span className="rzm-card-metric-lbl">RT</span>
            <span className="rzm-card-metric-val">{group.avgResponseTime}ms</span>
          </div>
        )}
        {group.lastIncident && (
          <div className="rzm-card-metric-item">
            <span className="rzm-card-metric-lbl">Last incident</span>
            <span className="rzm-card-metric-val">{formatRelative(group.lastIncident)}</span>
          </div>
        )}
      </div>

      {/* Failing item */}
      {topFailing && <FailingItem conn={topFailing} />}

      {/* Action buttons */}
      <div className="rzm-card-actions" onClick={(e) => e.stopPropagation()}>
        <ActionBtn label="Open" icon="▶" variant="ghost" onClick={onClick} />
        <ActionBtn
          label="Diagnose"
          icon="⊕"
          variant="ghost"
          running={isDiagnosing}
          onClick={() => onAction(group.id, 'run-diagnostics')}
        />
        <ActionBtn
          label="Ask Rex"
          icon="◈"
          variant="ghost"
          onClick={() => onAction(group.id, 'ask-rex')}
        />
        {(isDown || isDegraded) && (
          <ActionBtn
            label="Restart"
            icon="⟳"
            variant="danger"
            running={isRestarting}
            onClick={() => onAction(group.id, 'restart')}
          />
        )}
      </div>
    </div>
  );
}
