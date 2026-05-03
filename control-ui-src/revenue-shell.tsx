/**
 * Task Enterprise — Revenue Engine C2
 * PHASE 1: Shell + Navigation + Layout
 *
 * Drop-in replacement/extension for the main shell
 * Adds Revenue Engine section to sidebar + handles revenue routing
 */

import { useState, useEffect, useCallback } from "react";
import { REVENUE_NAV, type RevenuePageKey } from "./revenue-types";
import { HealthBadge } from "./revenue-components";

/* ─── Revenue Sidebar ─── */

export function RevenueSidebar({
  current,
  onNavigate,
  health,
  isLoopRunning,
}: {
  current: RevenuePageKey;
  onNavigate: (page: RevenuePageKey) => void;
  health?: "healthy" | "degraded" | "critical";
  isLoopRunning?: boolean;
}) {
  const sections: string[] = [];
  REVENUE_NAV.forEach((n) => {
    if (n.section && !sections.includes(n.section)) sections.push(n.section);
  });
  const topItems = REVENUE_NAV.filter((n) => !n.section);

  return (
    <aside className="re-sidebar">
      {/* Brand */}
      <div className="re-sidebar-brand">
        <RevenueLogo />
        <div className="re-brand-text">
          <span className="re-brand-title">Task Enterprise</span>
          <span className="re-brand-sub">Revenue Engine</span>
        </div>
      </div>

      {/* Health + Loop state */}
      <div className="re-sidebar-status">
        {health && <HealthBadge status={health} />}
        {isLoopRunning && (
          <span className="re-loop-indicator">
            <span className="re-loop-dot" />
            Loop running
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="re-sidebar-nav">
        <div className="re-nav-section">
          {topItems.map((item) => (
            <NavButton key={item.key} item={item} active={current === item.key} onNavigate={onNavigate} />
          ))}
        </div>
        {sections.map((sec) => (
          <div className="re-nav-section" key={sec}>
            <div className="re-nav-section-label">{sec}</div>
            {REVENUE_NAV.filter((n) => n.section === sec).map((item) => (
              <NavButton key={item.key} item={item} active={current === item.key} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="re-sidebar-footer">
        <span className="re-sidebar-version">C2 · Revenue Engine v1</span>
      </div>
    </aside>
  );
}

function NavButton({
  item,
  active,
  onNavigate,
}: {
  item: (typeof REVENUE_NAV)[0];
  active: boolean;
  onNavigate: (page: RevenuePageKey) => void;
}) {
  return (
    <button
      className={`re-nav-item ${active ? "re-nav-item-active" : ""}`}
      onClick={() => onNavigate(item.key)}
      type="button"
    >
      <span className="re-nav-icon">{item.icon}</span>
      {item.label}
    </button>
  );
}

/* ─── Revenue Logo ─── */

function RevenueLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      {/* Outer ring */}
      <circle cx="16" cy="16" r="14" stroke="#dc3545" strokeWidth="1" strokeOpacity="0.3" fill="none" strokeDasharray="2 3" />
      {/* Inner ring */}
      <circle cx="16" cy="16" r="9" stroke="#dc3545" strokeWidth="1" strokeOpacity="0.5" fill="none" />
      {/* Center */}
      <circle cx="16" cy="16" r="4" fill="#dc3545" />
      {/* Upward trend line */}
      <polyline points="8,22 13,16 17,18 24,10" stroke="#dc3545" strokeWidth="1.5" strokeOpacity="0.8"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Revenue Topbar ─── */

export function RevenueTopbar({
  page,
  cycleCount,
  lastRun,
  onTriggerLoop,
  isBusy,
}: {
  page: RevenuePageKey;
  cycleCount?: number;
  lastRun?: string;
  onTriggerLoop?: () => void;
  isBusy?: boolean;
}) {
  const meta = PAGE_META[page];

  return (
    <header className="re-topbar">
      <div className="re-topbar-left">
        <h1 className="re-topbar-title">{meta.title}</h1>
        {meta.subtitle && <span className="re-topbar-sub">{meta.subtitle}</span>}
      </div>
      <div className="re-topbar-right">
        {cycleCount !== undefined && (
          <div className="re-topbar-stat">
            <span className="re-dim">Cycle</span>
            <span className="re-topbar-val">#{cycleCount}</span>
          </div>
        )}
        {lastRun && (
          <div className="re-topbar-stat">
            <span className="re-dim">Last run</span>
            <span className="re-topbar-val">{lastRun}</span>
          </div>
        )}
        {onTriggerLoop && (
          <button
            className={`re-trigger-btn ${isBusy ? "re-trigger-busy" : ""}`}
            onClick={onTriggerLoop}
            disabled={isBusy}
            type="button"
          >
            {isBusy ? "Running…" : "⟳ Run Loop"}
          </button>
        )}
      </div>
    </header>
  );
}

const PAGE_META: Record<RevenuePageKey, { title: string; subtitle?: string }> = {
  "revenue-overview":    { title: "Revenue Overview",   subtitle: "Live performance snapshot" },
  "revenue-goals":       { title: "Goals",              subtitle: "Revenue targets + tracking" },
  "revenue-decisions":   { title: "Decision Log",       subtitle: "What the system decided and why" },
  "revenue-actions":     { title: "Action Feed",        subtitle: "Real-time agent activity" },
  "revenue-loop":        { title: "Autonomous Loop",    subtitle: "PLAN → EXECUTE → TRACK → ANALYZE → DECIDE → ACT" },
  "revenue-experiments": { title: "Experiments",        subtitle: "A/B tests + optimization" },
  "revenue-agents":      { title: "Agent Status",       subtitle: "Multi-agent system monitor" },
  "revenue-control":     { title: "Control Panel",      subtitle: "System commands + automation" },
};

/* ─── Revenue App Shell ─── */

export function RevenueShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="re-shell">
      {children}
    </div>
  );
}

/* ─── Main content area ─── */

export function RevenueMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="re-main">
      {children}
    </main>
  );
}

/* ─── Page grid layouts ─── */

export function TwoColumn({
  left,
  right,
  ratio = "60/40",
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  ratio?: "60/40" | "50/50" | "70/30";
}) {
  const cols = { "60/40": "3fr 2fr", "50/50": "1fr 1fr", "70/30": "7fr 3fr" }[ratio];
  return (
    <div className="re-two-col" style={{ gridTemplateColumns: cols }}>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

export function MetricsRow({ children }: { children: React.ReactNode }) {
  return <div className="re-metrics-row">{children}</div>;
}

export function PageContent({ children }: { children: React.ReactNode }) {
  return <div className="re-page-content">{children}</div>;
}
