# Task Enterprise — Revenue Engine C2
## Frontend System Plan

**Owner:** Claude (Frontend)  
**Status:** Phase 1 Complete — Awaiting Phase 2 confirmation  
**Date:** 2026-04-28

---

## Architecture Decision

**Extend, don't rebuild.** Revenue Engine modules plug into the existing Codex control UI shell.  
Zero duplication. Full design system inheritance.

```
repos/codex-mcp-server/control-ui-src/
├── (existing files — unchanged)
├── revenue-types.ts          ✅ Phase 1
├── revenue-components.tsx    ✅ Phase 1
├── revenue-shell.tsx         ✅ Phase 1
├── revenue-styles.css        ✅ Phase 1
├── pages-revenue.tsx         ⬜ Phase 2
├── pages-intelligence.tsx    ⬜ Phase 3
├── revenue-loop.tsx          ⬜ Phase 4
├── pages-experiments.tsx     ⬜ Phase 5
└── pages-control.tsx         ⬜ Phase 6
```

---

## Phase Status

| Phase | Module | Status | Output |
|-------|--------|--------|--------|
| 1 | Shell + Nav | ✅ Done | revenue-shell.tsx, revenue-types.ts, revenue-styles.css, revenue-components.tsx |
| 2 | Revenue Overview + Goals | ⬜ Pending | pages-revenue.tsx |
| 3 | Intelligence Layer | ⬜ Pending | pages-intelligence.tsx |
| 4 | Loop Visualizer | ⬜ Pending | revenue-loop.tsx |
| 5 | Experiments | ⬜ Pending | pages-experiments.tsx |
| 6 | Control Panel | ⬜ Pending | pages-control.tsx |

---

## Component System (Phase 1)

### Types (`revenue-types.ts`)
- `Goal`, `MetricSnapshot`, `Decision`, `ActionFeedItem`
- `LoopState`, `Experiment`, `SystemHealth`, `AgentPanel`
- `RevenuePageKey` — 8 pages
- `revenueApi` — typed API client (connects to backend on `VITE_API_URL`)
- Helper formatters: `fmtCurrency`, `fmtPct`, `fmtRelative`
- Color resolvers: `goalStatusColor`, `decisionActionColor`, `loopPhaseColor`

### Components (`revenue-components.tsx`)
- `MetricCard` — value + delta + trend + source badge
- `GoalProgressBar` — name + progress track + status color
- `DecisionCard` — action + confidence bar + impact + score
- `ConfidenceBar` — inline 0-100% bar
- `ActionFeedItem` — agent + message + status + timestamp
- `AgentStatusPanel` — 8-agent grid with color coding
- `LoopPhaseNode` — animated phase circle for loop visualizer
- `Panel` — reusable container with head + body
- `HealthBadge`, `EmptyState`, `SkeletonBlock`

### Shell (`revenue-shell.tsx`)
- `RevenueSidebar` — 8-item nav, health badge, loop indicator
- `RevenueTopbar` — title + cycle count + last run + trigger button
- `RevenueShell`, `RevenueMain` — layout wrappers
- `TwoColumn`, `MetricsRow`, `PageContent` — grid layouts

### Styles (`revenue-styles.css`)
- Extends base design tokens (no overrides)
- All `.re-*` namespaced classes
- Shell, sidebar, topbar, metric cards, goal rows, decision cards
- Action feed, agent grid, loop visualizer, experiment cards
- Control panel toggles, health indicators
- Skeleton loaders, empty states, animations

---

## API Integration Points

Pending `CLAUDE_FRONTEND_HANDOFF.md` — stub endpoints:

```
GET  /api/goals            → Goal[]
GET  /api/metrics          → MetricSnapshot[]
GET  /api/decisions        → Decision[]
GET  /api/actions          → ActionFeedItem[]
GET  /api/loop             → LoopState
GET  /api/experiments      → Experiment[]
GET  /api/health           → SystemHealth
GET  /api/agents/status    → AgentPanel[]
POST /api/loop/trigger     → { ok, cycleId }
PATCH /api/goals/:id       → Goal
POST /api/control/automation → { ok }
```

---

## Preview

`control-ui/revenue-c2-preview.html` — fully interactive HTML demo  
Open in browser to see the complete Phase 1 shell + all 8 pages.

---

## Next: Phase 2

Confirm to begin `pages-revenue.tsx`:
- Revenue Overview page (full data-connected implementation)
- Goals dashboard with inline editing
- Metrics panel with chart modules
- Decision log with filtering + sorting
