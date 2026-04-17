/* ─── Rex Command Zone — Rex Copilot & Heartbeat Diagnostics ─── */

import { useEffect, useRef, useState } from 'react';
import { formatRelative } from './types';
import {
  calcHealth, healthColor, healthLabel,
  type Connection, type HeartbeatJob, type RexMessage,
} from './data-monitoring';

// ── Rex Response Generator ────────────────────────────────────────

export function generateRexResponse(context: string, prompt: string): string {
  const lc = (context + prompt).toLowerCase();

  if (lc.includes('project2') || lc.includes('strike')) {
    return `Analysis initiated for HEARTBEAT - Project2 Strike Run.

Root cause assessment:
• Last heartbeat received: 4h 23m ago (expected: every 30min)
• Worker node 'strike-runner' shows no recent process activity
• Job scheduler DB entry: LOCKED state since 04:12 UTC

Probable cause: Worker process OOM killed or scheduler DB lock not released after previous run.

Recommended actions:
1. SSH into worker node → check process list: ps aux | grep strike
2. Inspect scheduler DB: SELECT * FROM jobs WHERE status='LOCKED'
3. Force-release lock and manually trigger: ./run-job strike-run --force
4. Monitor next 3 cycles before closing incident

Risk level: HIGH — this is the same lock pattern seen in incident inc-004 (Dec 2025). Check dmesg on strike-runner for OOM events.`;
  }

  if (lc.includes('backup') || lc.includes('daily backup')) {
    return `Backup Job Diagnostic — 26h Overdue

Status: CRITICAL — Data integrity at risk.

Assessment:
• Last confirmed run: Yesterday 02:00 UTC
• Current gap: 26h (expected: 24h cycle)
• Heartbeat endpoint: push://kuma/heartbeat/daily-backup

Immediate action sequence:
1. Verify cron entry: crontab -l | grep backup
2. Check cron daemon: journalctl -u cron --since yesterday
3. Review disk space: df -h (backup may have failed silently on full disk)
4. PRIORITY: Trigger emergency backup NOW before investigating root cause

Recovery command: ./scripts/backup.sh --emergency --notify-heartbeat
After backup completes, resolve lock and reschedule normal cycle.`;
  }

  if (lc.includes('notion') || lc.includes('latency')) {
    return `Notion API Latency Analysis

Current metrics:
• Response time: 445ms (baseline: 108ms, +312%)
• Rate limit headers: X-RateLimit-Remaining: 12/180

Root cause:
Notion enforces 3 req/sec per integration. Your n8n automation workflows are hitting this during peak scheduling windows (06:00–09:00 UTC based on logs).

Fix options:
1. Reduce n8n Notion sync polling from every 60s to every 5min
2. Implement request batching in workflow nodes
3. Add exponential backoff: start at 2s, max 30s
4. Enable Notion webhook mode (eliminates polling entirely)

Expected improvement: Response times back to <150ms within 30 minutes of implementing #1.`;
  }

  if (lc.includes('desktop relay') || lc.includes('relay')) {
    return `Desktop Relay Diagnostics

Connection: tcp://localhost:9999
Current latency: 445ms (baseline: 107ms, +312%)

Possible causes:
• Local network congestion or NIC saturation
• Process competing for localhost bandwidth
• Desktop relay buffer overflow under load
• DNS resolution latency (unlikely for localhost)

Diagnostic commands:
1. Check active connections: ss -tunap | grep 9999
2. View relay process stats: top -p $(pgrep relay)
3. Check localhost routing: ping -c 4 localhost
4. Review relay logs: journalctl -u desktop-relay -n 50

Note: The relay has been healthy for 98.47% of the last 30 days. This is likely a transient spike. Monitor for 30 minutes before escalating.`;
  }

  if (lc.includes('recovery') || lc.includes('recover')) {
    return `Recovery Playbook — General Guidance

For connection failures, follow this sequence:
1. Verify the endpoint is reachable externally (curl -I <endpoint>)
2. Check for upstream provider incidents (status pages)
3. Inspect local logs for error patterns
4. Attempt retry with increased timeout
5. If persistent: escalate to reconnect with fresh auth tokens

For heartbeat failures:
1. Confirm worker node is reachable (ping/SSH)
2. Check for OOM kills (dmesg | grep -i "out of memory")
3. Verify cron/scheduler is running
4. Manually trigger job and verify heartbeat receipt

Recovery success rate for similar incidents: 87% resolved within 2 hours following this playbook.`;
  }

  if (lc.includes('docker')) {
    return `Docker Infrastructure — Health Summary

Current status: ALL CONTAINERS OPTIMAL (100% uptime)

Container inventory:
• postgres-prod: healthy, 4ms response
• redis-prod: healthy, 2ms response
• n8n: healthy, 8ms response
• uptime-kuma: healthy, 6ms response
• traefik: healthy, 3ms response

No issues detected. Last 48 hours clean.

Recommendations:
• Consider setting up Docker healthcheck intervals if not already configured
• Review container resource limits quarterly
• Traefik access logs may be worth reviewing for unusual traffic patterns`;
  }

  // Default contextual response
  const connName = context.split('—')[0].trim();
  return `Diagnostic analysis for: ${connName}

I've reviewed the connection telemetry and recent beat history.

Observations:
• Connection metrics are within expected parameters for this type
• No anomalous patterns in the last 40 check cycles detected
• Uptime data suggests ${lc.includes('100') ? 'this connection is performing optimally' : 'there may be intermittent issues worth investigating'}

To get more specific insights, try:
• "Why is this failing?" — root cause analysis
• "Suggest recovery" — step-by-step remediation
• "What changed recently?" — change correlation analysis

I can also run a full diagnostic scan if you'd like detailed telemetry.`;
}

// ── RexCopilot ───────────────────────────────────────────────────

interface RexCopilotProps {
  messages: RexMessage[];
  context: string | null;
  onSend: (msg: string) => void;
  isTyping: boolean;
  quickPrompts: string[];
  onClose?: () => void;
}

export function RexCopilot({ messages, context, onSend, isTyping, quickPrompts, onClose }: RexCopilotProps) {
  const [input, setInput] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  }

  return (
    <div className="rzm-console rzm-rex-panel">
      {/* Header */}
      <div className="rzm-rex-header">
        <span className="rzm-rex-title">◈ REX // DIAGNOSTIC ASSISTANT</span>
        {context && (
          <span className="rzm-rex-context-badge rzm-rex-context-badge-sm">
            {context.split('—')[0].trim()}
          </span>
        )}
        {onClose && (
          <button className="rzm-icon-btn rzm-icon-btn-sm rzm-rex-close" onClick={onClose} title="Close Rex">×</button>
        )}
      </div>

      {/* Context bar */}
      {context && (
        <div className="rzm-rex-context-bar">
          <span className="rzm-label">CTX</span>
          <span className="rzm-rex-context-text">{context}</span>
        </div>
      )}

      {/* Quick prompts */}
      {quickPrompts.length > 0 && (
        <div className="rzm-rex-quick-prompts-strip">
          {quickPrompts.map(p => (
            <button key={p} className="rzm-rex-prompt-pill" onClick={() => onSend(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="rzm-rex-messages" ref={bodyRef}>
        {messages.length === 0 && !isTyping && (
          <div className="rzm-empty-state">
            <span>◈</span>
            <span>Rex is ready. Ask about any connection, group, or incident.</span>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`rzm-rex-msg rzm-rex-msg-${msg.role}`}
          >
            {msg.role === 'rex' && (
              <div className="rzm-rex-msg-label">◈ REX</div>
            )}
            <div className="rzm-rex-msg-content">{msg.content}</div>
            <div className="rzm-rex-msg-time">{formatRelative(msg.timestamp)}</div>
          </div>
        ))}
        {isTyping && (
          <div className="rzm-rex-msg rzm-rex-msg-rex rzm-rex-typing">
            <div className="rzm-rex-msg-label">◈ REX</div>
            <div className="rzm-rex-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="rzm-rex-input-area">
        <input
          className="rzm-rex-input"
          placeholder="Ask Rex about your infrastructure…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button
          className="rzm-btn rzm-btn-primary"
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
        >
          {isTyping ? <span className="rzm-spinner" /> : '⟶'}
        </button>
      </div>
    </div>
  );
}

// ── HeartbeatDiagnosticsPanel ─────────────────────────────────────

interface HeartbeatDiagnosticsPanelProps {
  jobs: HeartbeatJob[];
  connections: Connection[];
}

export function HeartbeatDiagnosticsPanel({ jobs, connections }: HeartbeatDiagnosticsPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [auditRunning, setAuditRunning] = useState(false);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runAudit() {
    setAuditRunning(true);
    setTimeout(() => setAuditRunning(false), 2500);
  }

  const total    = jobs.length;
  const active   = jobs.filter(j => j.status === 'active').length;
  const missed   = jobs.filter(j => j.status === 'missed').length;
  const critical = jobs.filter(j => j.status === 'critical').length;
  const avgRate  = jobs.reduce((a, j) => a + j.successRate24h, 0) / Math.max(jobs.length, 1);

  const failedJobs = jobs.filter(j => j.status !== 'active');

  return (
    <div className="rzm-hb-diag">
      <div className="rzm-section-label">HEARTBEAT DIAGNOSTICS</div>

      {/* Summary strip */}
      <div className="rzm-hb-summary">
        <div className="rzm-hb-stat">
          <span className="rzm-kpi-value">{total}</span>
          <span className="rzm-kpi-label">TOTAL</span>
        </div>
        <div className="rzm-hb-stat">
          <span className="rzm-kpi-value" style={{ color: 'var(--rzm-green)' }}>{active}</span>
          <span className="rzm-kpi-label">ACTIVE</span>
        </div>
        <div className="rzm-hb-stat">
          <span className="rzm-kpi-value" style={{ color: 'var(--rzm-amber)' }}>{missed}</span>
          <span className="rzm-kpi-label">MISSED</span>
        </div>
        <div className="rzm-hb-stat">
          <span className="rzm-kpi-value" style={{ color: 'var(--rzm-red)' }}>{critical}</span>
          <span className="rzm-kpi-label">CRITICAL</span>
        </div>
        <div className="rzm-hb-stat">
          <span className="rzm-kpi-value" style={{ color: avgRate > 80 ? 'var(--rzm-green)' : avgRate > 50 ? 'var(--rzm-amber)' : 'var(--rzm-red)' }}>
            {avgRate.toFixed(0)}%
          </span>
          <span className="rzm-kpi-label">24H RATE</span>
        </div>
      </div>

      {/* Failed jobs table */}
      {failedJobs.length > 0 && (
        <div className="rzm-hb-table">
          <div className="rzm-hb-table-header">
            <span>JOB</span>
            <span>INTERVAL</span>
            <span>LAST RECV</span>
            <span>MISSES</span>
            <span>STATUS</span>
          </div>
          {failedJobs.map(job => {
            const isExp = expanded.has(job.id);
            const conn = connections.find(c => c.id === job.connectionId);
            return (
              <div key={job.id} className="rzm-hb-job-block">
                <div
                  className={`rzm-hb-job-row rzm-hb-job-${job.status}`}
                  onClick={() => toggleExpand(job.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') toggleExpand(job.id); }}
                >
                  <span className="rzm-hb-job-name">{job.name}</span>
                  <span className="rzm-hb-job-interval">{job.expectedIntervalMin}m</span>
                  <span className="rzm-hb-job-last">{job.lastReceived ? formatRelative(job.lastReceived) : 'Never'}</span>
                  <span className="rzm-hb-job-misses" style={{ color: job.consecutiveMisses > 3 ? 'var(--rzm-red)' : 'var(--rzm-amber)' }}>
                    {job.consecutiveMisses}
                  </span>
                  <span className={`rzm-pill rzm-pill-${job.status === 'critical' ? 'critical' : 'degraded'}`}>
                    {job.status.toUpperCase()}
                  </span>
                  <span className="rzm-hb-expand-toggle">{isExp ? '▲' : '▼'}</span>
                </div>

                {isExp && (
                  <div className="rzm-hb-job-detail">
                    <div className="rzm-hb-detail-row">
                      <span className="rzm-label">Failure Reason</span>
                      <span className="rzm-hb-detail-text">{job.failureReason}</span>
                    </div>
                    <div className="rzm-hb-detail-row">
                      <span className="rzm-label">Suggested Fix</span>
                      <span className="rzm-hb-detail-text">{job.suggestedFix}</span>
                    </div>
                    {job.workerNode && (
                      <div className="rzm-hb-detail-row">
                        <span className="rzm-label">Worker Node</span>
                        <span className="rzm-mono">{job.workerNode}</span>
                      </div>
                    )}
                    {conn && (
                      <div className="rzm-hb-detail-row">
                        <span className="rzm-label">24h Rate</span>
                        <span style={{ color: job.successRate24h > 80 ? 'var(--rzm-green)' : job.successRate24h > 50 ? 'var(--rzm-amber)' : 'var(--rzm-red)' }}>
                          {job.successRate24h.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <div className="rzm-hb-detail-actions">
                      <button className="rzm-btn rzm-btn-danger">⟳ Rerun</button>
                      <button className="rzm-btn rzm-btn-ghost">◻ Inspect</button>
                      <button className="rzm-btn rzm-btn-ghost">◈ Ask Rex</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {failedJobs.length === 0 && (
        <div className="rzm-empty-state">All heartbeat jobs are active</div>
      )}

      <div style={{ padding: '12px 16px' }}>
        <button
          className="rzm-btn rzm-btn-primary"
          style={{ width: '100%' }}
          onClick={runAudit}
          disabled={auditRunning}
        >
          {auditRunning ? <><span className="rzm-spinner" /> Running Audit…</> : '⊛ Run Full Heartbeat Audit'}
        </button>
      </div>
    </div>
  );
}
