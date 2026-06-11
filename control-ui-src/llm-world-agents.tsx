import { useEffect, useState } from "react";
import { Panel } from "./shell";

export type AgentRecord = {
  id: string;
  name: string;
  role: string;
  description: string;
  permissions: { integration: string; level: string }[];
  toolAccess: string[];
  memoryScope: string[];
  status: string;
  heartbeatAt: string;
  activeSessionCount: number;
  lastActivityAt: string;
};

const POLL_INTERVAL_MS = 15000;
const STALE_THRESHOLD_MS = 3 * 60 * 1000;

function formatAge(iso: string, now: number): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "unknown";
  const diffMs = Math.max(0, now - ts);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type ChatMessage = { speaker: string; text: string };

function AgentChatPanel({ agent }: { agent: AgentRecord }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages;
    setMessages((prev) => [...prev, { speaker: "TASK", text }]);
    setInput("");
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/c2/v1/${agent.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body?.error || `Status ${res.status}`);
      setMessages((prev) => [...prev, { speaker: agent.name, text: body.data.reply }]);
    } catch (err: any) {
      setError(err?.message || "Failed to reach agent");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="llmw-agent-chat" onClick={(e) => e.stopPropagation()}>
      <div className="llmw-agent-detail-label">Talk to {agent.name}</div>
      <div className="llmw-agent-chat-log">
        {messages.length === 0 && <div className="llmw-agent-chat-empty">Say hello to {agent.name}.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`llmw-agent-chat-msg ${m.speaker === "TASK" ? "llmw-agent-chat-msg-self" : "llmw-agent-chat-msg-agent"}`}>
            <span className="llmw-agent-chat-speaker">{m.speaker}</span>
            <span className="llmw-agent-chat-text">{m.text}</span>
          </div>
        ))}
        {sending && <div className="llmw-agent-chat-msg llmw-agent-chat-msg-agent llmw-agent-chat-pending">{agent.name} is typing…</div>}
      </div>
      {error && <div className="llmw-drawer-error">{error}</div>}
      <div className="llmw-agent-chat-input-row">
        <input
          className="llmw-agent-chat-input"
          value={input}
          placeholder={`Message ${agent.name}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          disabled={sending}
        />
        <button className="btn btn-primary llmw-agent-chat-send" onClick={() => void send()} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

function AgentCommandCard({ agent, now, expanded, onToggle }: { agent: AgentRecord; now: number; expanded: boolean; onToggle: () => void }) {
  const heartbeatTs = new Date(agent.heartbeatAt).getTime();
  const isStale = !Number.isFinite(heartbeatTs) || now - heartbeatTs > STALE_THRESHOLD_MS;
  const isOnline = agent.status === "online" && !isStale;

  return (
    <div
      className={`llmw-agent-card llmw-agent-${agent.id} ${expanded ? "llmw-agent-card-expanded" : ""}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
    >
      <div className="llmw-agent-card-head">
        <div className="llmw-agent-name">{agent.name}</div>
      </div>
      <div className="llmw-agent-role">{agent.role}</div>
      <div className="llmw-agent-status-row">
        <span className={`llmw-agent-status-dot ${isOnline ? "" : "llmw-agent-status-dot-offline"}`} />
        <span className="llmw-agent-status-label">{isOnline ? "Online" : isStale ? "Stale" : "Offline"}</span>
        <span className="llmw-agent-heartbeat">heartbeat {formatAge(agent.heartbeatAt, now)}</span>
      </div>
      <div className="llmw-agent-meta-row">
        <span>Active sessions</span>
        <span className="llmw-agent-sessions">{agent.activeSessionCount}</span>
      </div>
      {expanded && (
        <div className="llmw-agent-detail">
          <div className="text-xs text-2">{agent.description}</div>
          {agent.toolAccess.length > 0 && (
            <div>
              <div className="llmw-agent-detail-label">Tool access</div>
              <div className="llmw-agent-tag-row">
                {agent.toolAccess.map((tool) => (
                  <span key={tool} className="llmw-agent-tag">{tool}</span>
                ))}
              </div>
            </div>
          )}
          {agent.memoryScope.length > 0 && (
            <div>
              <div className="llmw-agent-detail-label">Memory scope</div>
              <div className="llmw-agent-tag-row">
                {agent.memoryScope.map((scope) => (
                  <span key={scope} className="llmw-agent-tag">{scope}</span>
                ))}
              </div>
            </div>
          )}
          {agent.permissions.length > 0 && (
            <div>
              <div className="llmw-agent-detail-label">Permissions</div>
              <div className="llmw-agent-tag-row">
                {agent.permissions.map((perm) => (
                  <span key={`${perm.integration}-${perm.level}`} className="llmw-agent-tag">{perm.integration}: {perm.level}</span>
                ))}
              </div>
            </div>
          )}
          <AgentChatPanel agent={agent} />
        </div>
      )}
    </div>
  );
}

export function AgentRosterGrid() {
  const [agents, setAgents] = useState<AgentRecord[] | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/c2/v1/agents")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Status ${res.status}`))))
        .then((body: { ok: boolean; data: AgentRecord[] }) => {
          if (cancelled) return;
          setAgents(body.data || []);
          setError("");
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err?.message || "Failed to load agent roster");
        });
    };
    load();
    const dataInterval = setInterval(load, POLL_INTERVAL_MS);
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; clearInterval(dataInterval); clearInterval(clockInterval); };
  }, []);

  const onlineCount = agents ? agents.filter((a) => a.status === "online").length : 0;

  return (
    <div className="llmw-roster-section">
      <Panel
        title="Command Roster"
        subtitle="Your agents — live status, heartbeat, and active sessions."
        action={agents ? <span className="text-xs text-2">{onlineCount}/{agents.length} online</span> : null}
      >
        {error && <div className="llmw-drawer-error">{error}</div>}
        {!agents && !error && <div className="text-xs text-2">Loading roster…</div>}
        {agents && (
          <div className="llmw-roster-grid">
            {agents.map((agent) => (
              <AgentCommandCard
                key={agent.id}
                agent={agent}
                now={now}
                expanded={expandedId === agent.id}
                onToggle={() => setExpandedId((prev) => (prev === agent.id ? null : agent.id))}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
