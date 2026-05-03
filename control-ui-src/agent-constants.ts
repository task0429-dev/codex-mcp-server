/**
 * agent-constants.ts — Single source of truth for agent identity.
 * Import from here in every tab. Never hardcode agent colors elsewhere.
 */
import React from "react";

export const AGENT_COLORS: Record<string, string> = {
  abdi:  "#ef4444",  // red
  ahmed: "#84cc16",  // lime
  dame:  "#f59e0b",  // gold
  rex:   "#22c55e",  // green
  prime: "#8b5cf6",  // purple
  atlas: "#06b6d4",  // cyan
  ayub:  "#3b82f6",  // blue
  sygma: "#ec4899",  // hot pink
};

/** Dark tinted background version of each agent's color — for cards, desks, etc. */
export const AGENT_BG_COLORS: Record<string, string> = {
  abdi:  "#2a0808",
  ahmed: "#0e1f00",
  dame:  "#2a1a00",
  rex:   "#082a12",
  prime: "#150a28",
  atlas: "#062028",
  ayub:  "#081828",
  sygma: "#2a0818",
};

/** Returns the canonical color for an agent (by id, lowercase). Falls back to accent. */
export function agentColor(agentId: string): string {
  return AGENT_COLORS[(agentId || "").toLowerCase()] ?? "var(--accent)";
}

/** Returns the dark background tint for an agent. Falls back to a neutral dark. */
export function agentBgColor(agentId: string): string {
  return AGENT_BG_COLORS[(agentId || "").toLowerCase()] ?? "#111827";
}

/** Canonical agent display order — use everywhere agents are listed. */
export const AGENT_ORDER = ["abdi", "dame", "ayub", "ahmed", "atlas", "rex", "prime", "sygma"];

/** Sort an array of agent objects by canonical order. */
export function sortAgents<T extends { id: string }>(agents: T[]): T[] {
  return [...agents].sort((a, b) => {
    const ai = AGENT_ORDER.indexOf(a.id.toLowerCase());
    const bi = AGENT_ORDER.indexOf(b.id.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/** SVG icon paths for each agent — used in avatars across all tabs. */
export const AGENT_SVG: Record<string, React.ReactNode> = {
  abdi:  React.createElement(React.Fragment, null,
    React.createElement("path", { d: "M2 17h20l-2-10-5 5-3-8-3 8-5-5z" }),
    React.createElement("line", { x1: "2", y1: "17", x2: "22", y2: "17" })
  ),
  ahmed: React.createElement(React.Fragment, null,
    React.createElement("line", { x1: "18", y1: "20", x2: "18", y2: "9" }),
    React.createElement("line", { x1: "12", y1: "20", x2: "12", y2: "3" }),
    React.createElement("line", { x1: "6",  y1: "20", x2: "6",  y2: "13" }),
    React.createElement("line", { x1: "3",  y1: "20", x2: "21", y2: "20" })
  ),
  dame:  React.createElement(React.Fragment, null,
    React.createElement("polyline", { points: "4 17 10 11 4 5" }),
    React.createElement("line", { x1: "12", y1: "19", x2: "20", y2: "19" })
  ),
  rex:   React.createElement(React.Fragment, null,
    React.createElement("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" })
  ),
  prime: React.createElement(React.Fragment, null,
    React.createElement("polyline", { points: "23 6 13.5 15.5 8.5 10.5 1 18" }),
    React.createElement("polyline", { points: "17 6 23 6 23 12" })
  ),
  atlas: React.createElement(React.Fragment, null,
    React.createElement("circle", { cx: "18", cy: "5",  r: "2.5" }),
    React.createElement("circle", { cx: "6",  cy: "12", r: "2.5" }),
    React.createElement("circle", { cx: "18", cy: "19", r: "2.5" }),
    React.createElement("line", { x1: "8.5",  y1: "13.4", x2: "15.5", y2: "17.6" }),
    React.createElement("line", { x1: "15.5", y1: "6.4",  x2: "8.5",  y2: "10.6" })
  ),
  ayub:  React.createElement(React.Fragment, null,
    React.createElement("polyline", { points: "16 18 22 12 16 6" }),
    React.createElement("polyline", { points: "8 6 2 12 8 18" })
  ),
  sygma: React.createElement(React.Fragment, null,
    React.createElement("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }),
    React.createElement("polyline", { points: "9 12 11 14 15 10" })
  ),
};

/** Shared agent avatar — logo icon in a colored rounded square. Used in Messages + Voice tabs. */
export function AgentAvatar({ agentId, name, size = 36 }: { agentId: string; name: string; size?: number }) {
  const color = agentColor(agentId);
  const icon = AGENT_SVG[agentId.toLowerCase()];
  const r = Math.round(size * 0.24);
  const iconSize = Math.round(size * 0.58);
  return React.createElement("div", {
    style: {
      width: size, height: size,
      borderRadius: r,
      background: `linear-gradient(145deg, ${color}28 0%, ${color}12 100%)`,
      border: `1.5px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }
  }, icon
    ? React.createElement("svg", {
        width: iconSize, height: iconSize,
        viewBox: "0 0 24 24", fill: "none",
        stroke: color, strokeWidth: 2,
        strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
      }, icon)
    : React.createElement("span", {
        style: { color, fontSize: Math.round(size * 0.42), fontWeight: 700, lineHeight: 1 }
      }, (name || agentId).slice(0, 1).toUpperCase())
  );
}
