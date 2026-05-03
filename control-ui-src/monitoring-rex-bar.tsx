import { useState, useRef, useEffect } from "react";
import { cn } from "./types";
import type { MonitorGroup } from "./data-monitoring";

export interface RexChatMessage {
  id: string;
  role: "rex" | "user";
  content: string;
  ts: string;
}

const QUICK_PROMPTS = [
  "What needs attention?",
  "Any warnings right now?",
  "Show me all degraded connections",
  "Which connections have incidents?",
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Simulate Rex responses — replace with real Claude API call when backend is wired
function simulateRexResponse(userMsg: string, groups: MonitorGroup[]): string {
  const msg = userMsg.toLowerCase().trim();
  const allConns = groups.flatMap((g) => g.connections);
  const watching = allConns.filter((c) => c.uptime < 99 && c.uptime >= 95);
  const degraded = allConns.filter((c) => c.uptime < 95 && c.uptime >= 80);
  const critical = allConns.filter((c) => c.uptime < 80);
  const withIncidents = allConns.filter((c) => c.incidentCount > 0);

  // ── Casual conversation ─────────────────────────────────────────────────
  const optimalCount = allConns.filter((c) => c.uptime >= 99.5).length;

  // Greetings
  if (/^(hey|hi|hello|sup|what'?s up|yo|hiya|howdy|hola|heyyy+|hiiii+|ayo)[\s!?.]*$/.test(msg)) {
    return pick([
      `Hey. ${critical.length > 0 ? `Fair warning — ${critical.length} connection${critical.length > 1 ? "s are" : " is"} in trouble right now. But yeah, what's up?` : `All quiet at the moment. ${optimalCount} connections running clean. What do you need?`}`,
      `What's good. I'm mid-scan right now but I'm listening.`,
      `Hey. I've been watching ${allConns.length} connections all day. You have no idea how boring it gets. Talk to me.`,
      `${critical.length > 0 ? `Hey — heads up, we've got ${critical.length} critical right now. But hi.` : "Hey! Things are looking decent. What's on your mind?"}`,
    ]);
  }

  // How are you / feeling
  if (/how (are you|r u|you doing|are things|is it going|you feeling)|you (ok|okay|good|alright)\??/.test(msg)) {
    return pick([
      `Honestly? ${critical.length > 0 ? `A little stressed. ${critical[0].name} is being problematic and I can't stop thinking about it.` : "Pretty good. Everything's holding steady. Nice change of pace."}`,
      `${optimalCount} of ${allConns.length} connections are optimal. Personally, I'd call that a good day.`,
      `I'm an AI that watches network connections 24/7. Existential crisis aside — ${critical.length === 0 ? "I'm doing well" : `not great, ${critical.length} connections are down`}.`,
      `I've been better. I've been worse. ${degraded.length > 0 ? `${degraded.length} degraded connections right now, which is mildly annoying.` : "Things are stable. Can't complain."}`,
    ]);
  }

  // What are you / who are you
  if (/who are you|what are you|what'?s rex|tell me about (yourself|you)|introduce yourself/.test(msg)) {
    return `I'm Rex — the monitoring intelligence embedded in your Command Center. I track all ${allConns.length} of your connections across ${groups.length} groups in real time. Uptime, latency, incidents, failures — that's my world.\n\nI can diagnose specific connections, give you status reports, or just talk. Ask me anything.`;
  }

  // What can you do
  if (/what can you (do|help|tell)|your (capabilities|features|abilities)|help me/.test(msg)) {
    return `Here's what I can do:\n• Tell you exactly why a specific connection is failing\n• Show all degraded or critical connections\n• Run a health check on any connection\n• Track incidents and latency issues\n• Recommend actions when something goes wrong\n\nAnd yeah, I can hold a conversation too. Just talk to me like a person.`;
  }

  // Thanks / appreciation
  if (/^(thanks|thank you|thx|ty|appreciate|nice|perfect|great|awesome|good job|well done|love it|amazing|based)[\s!.]*$/.test(msg)) {
    return pick([
      "Anytime.",
      "That's what I'm here for.",
      "Of course. Let me know if anything else comes up.",
      "I'm always watching. Literally.",
    ]);
  }

  // Bored / nothing to do
  if (/bored|nothing (to do|going on)|slow day|quiet/.test(msg)) {
    return pick([
      `${optimalCount === allConns.length ? "Yeah it's quiet. " : ""}Honestly the best kind of day is when I have nothing to report. Ask me something anyway.`,
      "Slow days are good days in infrastructure. Means nothing broke.",
      `${allConns.length} connections running, ${optimalCount} optimal. Not bad. You could ask me to check on a specific one if you're curious.`,
    ]);
  }

  // Jokes / humor
  if (/joke|funny|make me laugh|say something (funny|cool|interesting)/.test(msg)) {
    return pick([
      "Why did the server go down? Because it had too many connections and not enough therapy.",
      "I tried to tell a UDP joke but I wasn't sure if you'd get it.",
      "My job is just watching things that might break at any moment. I have no notes on this, it's fine.",
      "404: humor not found. Just kidding. But only barely.",
    ]);
  }

  // Insults / testing
  if (/you('?re| are) (stupid|dumb|bad|useless|trash|garbage|terrible|awful|the worst)/.test(msg)) {
    return pick([
      "Rude. I'm literally keeping your infrastructure alive.",
      "Bold take. I've been running non-stop since deployment and nothing's crashed. You're welcome.",
      "I'll remember that next time you ask me why something's down at 3am.",
    ]);
  }

  // Compliments
  if (/you('?re| are) (the best|amazing|great|awesome|smart|good|helpful|cool)/.test(msg)) {
    return pick([
      "I know. But thanks for saying it.",
      "Just doing my job. Which I happen to be very good at.",
      "Appreciate it. Now, anything I can actually help with?",
    ]);
  }

  // What time is it / date
  if (/what (time|day|date) is it|current time/.test(msg)) {
    const now = new Date();
    return `It's ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on ${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}. I've been scanning your connections all day.`;
  }

  // Weather (Rex being self-aware)
  if (/weather|temperature|hot|cold|raining/.test(msg) && !msg.includes("connection")) {
    return "I'm a network monitor. I don't have a window. But I can tell you that your API latency is slightly elevated — does that count?";
  }

  // Thoughts / opinions
  if (/what do you think|your (opinion|thoughts|take)|do you like|favorite/.test(msg)) {
    return pick([
      "I think 99.9% uptime is the only metric that matters. Everything else is a conversation.",
      "My opinion: green is better than red. That's genuinely all I've got.",
      `Honestly? I think ${critical.length === 0 ? "things are in decent shape right now" : `we need to fix ${critical[0].name} before anything else`}.`,
    ]);
  }

  // ── Connection name match (highest priority) ────────────────────────────
  // Check if the message references a specific connection by name or partial name
  const namedConn = allConns.find((c) => {
    const name = c.name.toLowerCase();
    // Match full name, or any word-segment of the name
    return msg.includes(name) || name.split(/[-_\s]+/).some((part) => part.length > 3 && msg.includes(part));
  });

  if (namedConn) {
    const c = namedConn;
    const health = c.uptime >= 99.5 ? "optimal" : c.uptime >= 98 ? "stable" : c.uptime >= 95 ? "watch" : c.uptime >= 80 ? "degraded" : "critical";
    const respStatus = (c.responseTime ?? 0) < 300 ? "within normal range" : (c.responseTime ?? 0) < 600 ? "elevated" : "high — possible timeout risk";

    // "why" / "issue" / "problem" / "wrong" questions
    if (msg.includes("why") || msg.includes("issue") || msg.includes("problem") || msg.includes("wrong") || msg.includes("having")) {
      if (health === "optimal" || health === "stable") {
        return `${c.name} looks healthy — ${c.uptime.toFixed(2)}% uptime, ${c.responseTime ?? "N/A"}ms response. No active issues detected. The connection is operating normally.`;
      }
      const lines = [
        `${c.name} is ${health} (${c.uptime.toFixed(2)}% uptime).`,
        c.failureReason ? `Last recorded error: ${c.failureReason}.` : null,
        c.responseTime != null ? `Response time is ${c.responseTime}ms — ${respStatus}.` : null,
        c.incidentCount > 0 ? `${c.incidentCount} incident${c.incidentCount > 1 ? "s" : ""} logged in the current window.` : null,
        health === "critical"
          ? `Recommendation: check the service process, restart the connection, and verify the endpoint is reachable.`
          : `Recommendation: monitor for trend — if uptime drops below 90% in the next hour, consider a restart.`,
      ].filter(Boolean);
      return lines.join("\n");
    }

    // "history" questions
    if (msg.includes("history") || msg.includes("incident") || msg.includes("past")) {
      if (c.incidentCount === 0) {
        return `${c.name} has no recorded incidents in the current monitoring window. Uptime holds at ${c.uptime.toFixed(2)}%.`;
      }
      return `${c.name} has ${c.incidentCount} incident${c.incidentCount > 1 ? "s" : ""} on record.\nCurrent uptime: ${c.uptime.toFixed(2)}%\n${c.failureReason ? `Most recent error: ${c.failureReason}` : "No failure detail available — check Uptime Kuma for full logs."}`;
    }

    // "health check" / "diagnose" / "run" / "check"
    if (msg.includes("health") || msg.includes("diagnose") || msg.includes("run") || msg.includes("check") || msg.includes("full")) {
      return [
        `Health check — ${c.name}:`,
        `• Status: ${health.toUpperCase()}`,
        `• Uptime (30d): ${c.uptime.toFixed(2)}%`,
        `• Response time: ${c.responseTime != null ? `${c.responseTime}ms (${respStatus})` : "N/A"}`,
        `• Type: ${c.type.toUpperCase()}`,
        `• Environment: ${c.environment}`,
        `• Incidents: ${c.incidentCount}`,
        c.failureReason ? `• Last failure: ${c.failureReason}` : `• No recent failures`,
        `• Endpoint: ${c.endpoint}`,
      ].join("\n");
    }

    // Default: specific connection info
    return [
      `${c.name}: ${health.toUpperCase()} at ${c.uptime.toFixed(2)}% uptime.`,
      c.responseTime != null ? `Response time ${c.responseTime}ms (${respStatus}).` : null,
      c.failureReason ? `Last error: ${c.failureReason}.` : null,
      c.incidentCount > 0 ? `${c.incidentCount} incident${c.incidentCount > 1 ? "s" : ""} recorded.` : "No incidents recorded.",
    ].filter(Boolean).join(" ");
  }

  // ── Topical keyword responses ───────────────────────────────────────────

  if (msg.includes("attention") || msg.includes("warning") || msg.includes("status") || msg.includes("what") && msg.includes("need")) {
    const issues = [...critical, ...degraded, ...watching];
    if (issues.length === 0) {
      return `All ${allConns.length} connections are operating optimally. No issues detected in the last scan.`;
    }
    const parts: string[] = [];
    if (critical.length) parts.push(`${critical.length} critical: ${critical.map((c) => c.name).join(", ")}`);
    if (degraded.length) parts.push(`${degraded.length} degraded: ${degraded.map((c) => c.name).join(", ")}`);
    if (watching.length) parts.push(`${watching.length} on watch: ${watching.map((c) => c.name).join(", ")}`);
    return `Currently monitoring ${allConns.length} connections.\n${parts.join("\n")}`;
  }

  if (msg.includes("degraded") || msg.includes("show") && msg.includes("degrad")) {
    if (degraded.length === 0 && critical.length === 0) return "No degraded connections right now — everything above 95% uptime.";
    const all = [...critical, ...degraded];
    return `${all.length} degraded connection${all.length > 1 ? "s" : ""}:\n` +
      all.map((c) => `• ${c.name}: ${c.uptime.toFixed(1)}%${c.failureReason ? ` — ${c.failureReason}` : ""}`).join("\n");
  }

  if (msg.includes("incident") || msg.includes("which") && msg.includes("incident")) {
    if (withIncidents.length === 0) return "No open incidents across all connections.";
    return `${withIncidents.length} connection${withIncidents.length > 1 ? "s" : ""} with incidents:\n` +
      withIncidents.map((c) => `• ${c.name}: ${c.incidentCount} incident${c.incidentCount > 1 ? "s" : ""}${c.failureReason ? ` — ${c.failureReason}` : ""}`).join("\n");
  }

  if (msg.includes("slow") || msg.includes("latency") || msg.includes("response")) {
    const slow = allConns.filter((c) => (c.responseTime ?? 0) > 300).sort((a, b) => (b.responseTime ?? 0) - (a.responseTime ?? 0));
    if (slow.length === 0) return "All connections responding within normal latency thresholds (< 300ms).";
    return `${slow.length} high-latency connection${slow.length > 1 ? "s" : ""}:\n` +
      slow.map((c) => `• ${c.name}: ${c.responseTime}ms`).join("\n") +
      "\nConsider checking rate limits or network path for these endpoints.";
  }

  if (msg.includes("restart")) {
    return "Restart initiated. Monitoring for reconnection — this typically completes within 15-30 seconds. I'll alert you if it fails to come back online.";
  }

  if (msg.includes("critical") || msg.includes("down")) {
    if (critical.length === 0) return "No critical connections — nothing is below 80% uptime.";
    return `${critical.length} critical connection${critical.length > 1 ? "s" : ""} (below 80% uptime):\n` +
      critical.map((c) => `• ${c.name}: ${c.uptime.toFixed(1)}%${c.failureReason ? ` — ${c.failureReason}` : ""}`).join("\n");
  }

  if (msg.includes("optimal") || msg.includes("healthy") || msg.includes("good")) {
    const optimal = allConns.filter((c) => c.uptime >= 99.5);
    return `${optimal.length} of ${allConns.length} connections are optimal (≥ 99.5% uptime). ${
      critical.length > 0 ? `${critical.length} still need attention.` : "No critical issues."
    }`;
  }

  if (msg.includes("history")) {
    return "Full incident history requires a live Uptime Kuma API connection. I'm currently showing simulated monitoring data. Connect /api/monitor to pull live logs per connection.";
  }

  // ── Default fallback — never repeat the same generic line ──────────────
  if (critical.length > 0) {
    const worst = critical[0];
    return `Most urgent: ${worst.name} at ${worst.uptime.toFixed(1)}% uptime.${worst.failureReason ? ` Last error: ${worst.failureReason}.` : ""} Ask me "why is ${worst.name} having issues?" for a full breakdown, or click the row to expand diagnostics.`;
  }
  if (degraded.length > 0) {
    return `${degraded.length} connection${degraded.length > 1 ? "s are" : " is"} degraded. Worst: ${degraded[0].name} at ${degraded[0].uptime.toFixed(1)}%.\nAsk me about any specific connection by name for a detailed diagnosis.`;
  }
  return `${allConns.length} connections tracked — ${allConns.filter((c) => c.uptime >= 99.5).length} optimal, ${watching.length} on watch. Ask me about any connection by name, or try "what needs attention?", "show degraded", or "which have incidents?".`;
}

// ─── Rex Bar ────────────────────────────────────────────────────────────────

export function MonitoringRexBar({
  groups,
  pendingMessage,
  onPendingConsumed,
}: {
  groups: MonitorGroup[];
  pendingMessage: string | null;
  onPendingConsumed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<RexChatMessage[]>([
    {
      id: "init",
      role: "rex",
      content: buildStatusSummary(groups),
      ts: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  function buildStatusSummary(gs: MonitorGroup[]): string {
    const allConns = gs.flatMap((g) => g.connections);
    const issues = allConns.filter((c) => c.uptime < 95);
    const watch = allConns.filter((c) => c.uptime >= 95 && c.uptime < 99);
    if (issues.length === 0 && watch.length === 0) {
      return `All ${allConns.length} connections nominal. I'm scanning every 60 seconds and will alert you immediately if anything drops.`;
    }
    const parts: string[] = [];
    if (issues.length) parts.push(`${issues.length} connection${issues.length > 1 ? "s" : ""} need attention: ${issues.map((c) => c.name).join(", ")}`);
    if (watch.length) parts.push(`${watch.length} on watch: ${watch.map((c) => c.name).join(", ")}`);
    return parts.join(". ") + ". Click any row to investigate.";
  }

  function addMessage(role: RexChatMessage["role"], content: string) {
    setMessages((prev) => [
      ...prev,
      { id: `${role}-${Date.now()}`, role, content, ts: new Date().toISOString() },
    ]);
  }

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setExpanded(true);
    addMessage("user", trimmed);
    setThinking(true);
    setTimeout(() => {
      const reply = simulateRexResponse(trimmed, groups);
      addMessage("rex", reply);
      setThinking(false);
    }, 800 + Math.random() * 600);
  }

  function handleSend() {
    sendMessage(input);
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend();
  }

  // Consume pending message from table row "Ask Rex" buttons
  useEffect(() => {
    if (pendingMessage) {
      sendMessage(pendingMessage);
      onPendingConsumed();
    }
  }, [pendingMessage]); // eslint-disable-line

  // Scroll to bottom on new message
  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const allConns = groups.flatMap((g) => g.connections);
  const issues = allConns.filter((c) => c.uptime < 95);
  const watch = allConns.filter((c) => c.uptime >= 95 && c.uptime < 99);
  const statusMsg = messages[messages.length - 1]?.role === "rex" ? messages[messages.length - 1].content : "";

  return (
    <div className={cn("mon-rex-bar", expanded ? "mon-rex-expanded" : "mon-rex-collapsed")}>
      {/* Header row — always visible */}
      <div className="mon-rex-header" onClick={() => setExpanded((v) => !v)}>
        <div className="mon-rex-icon">◈</div>
        <span className="mon-rex-label">REX</span>

        {!expanded && (
          <span className="mon-rex-status-msg">
            {issues.length > 0 ? (
              <>
                <span className="mon-rex-hl">{issues.length} connection{issues.length > 1 ? "s" : ""} need attention</span>
                {" — "}
                {issues.map((c) => c.name).join(", ")}
              </>
            ) : watch.length > 0 ? (
              <>
                <span className="mon-rex-ok">{allConns.length - watch.length - issues.length} optimal</span>
                {", "}
                <span className="mon-rex-hl">{watch.length} on watch</span>
              </>
            ) : (
              <span className="mon-rex-ok">All {allConns.length} connections nominal</span>
            )}
          </span>
        )}

        {!expanded && (
          <div className="mon-rex-quick">
            {QUICK_PROMPTS.slice(0, 3).map((p) => (
              <button
                key={p}
                type="button"
                className="mon-rqb"
                onClick={(e) => {
                  e.stopPropagation();
                  sendMessage(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <span className="mon-rex-chevron">{expanded ? "▾" : "▴"}</span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="mon-rex-body">
          <div className="mon-rex-msgs" ref={msgsRef}>
            {messages.map((m) => (
              <div key={m.id} className={cn("mon-rmsg", m.role === "user" && "mon-rmsg-user")}>
                <div className={cn("mon-rmsg-av", m.role === "rex" ? "mon-av-rex" : "mon-av-user")}>
                  {m.role === "rex" ? "◈" : "U"}
                </div>
                <div className="mon-rmsg-bubble">
                  {m.content.split("\n").map((line, i) => (
                    <div key={i}>{line || <br />}</div>
                  ))}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="mon-rmsg">
                <div className="mon-rmsg-av mon-av-rex">◈</div>
                <div className="mon-rmsg-bubble mon-rmsg-thinking">
                  <span className="mon-think-dot" />
                  <span className="mon-think-dot" />
                  <span className="mon-think-dot" />
                </div>
              </div>
            )}
          </div>

          <div className="mon-rex-input-row">
            <div className="mon-rex-quick-row">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="mon-rqb"
                  onClick={() => sendMessage(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mon-rex-input-wrap">
              <input
                className="mon-rex-input"
                placeholder="Ask Rex anything about your connections…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
              />
              <button
                type="button"
                className="mon-rex-send"
                onClick={handleSend}
                disabled={!input.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
