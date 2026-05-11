import { useCallback, useEffect, useRef, useState } from "react";
import type { PageProps } from "./types";
import { AGENT_COLORS, agentColor, AGENT_ORDER } from "./agent-constants";

/* ─── Types ─── */

interface MsgReaction {
  emoji: string;
  /** "user" or agentId */
  from: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  agentId?: string;
  agentName?: string;
  text: string;
  ts: string;
  reactions: MsgReaction[];
  voiceNote?: boolean;
}

type ConvType = "dm" | "group";

interface Conversation {
  id: string;
  type: ConvType;
  /** DM: single agentId; Group: list of agentIds */
  agentIds: string[];
  name: string;
  pinned: boolean;
  lastUpdated: string;
  messages: ChatMessage[];
}

/* ─── Constants ─── */

const MSGS_KEY = "te_messages_v1";


const AGENT_VOLUME: Record<string, number> = { prime: 1.2, sygma: 1.15 };

const AGENT_SYNTH: Record<string, { pitch: number; rate: number; voiceHint: string; playbackRate: number }> = {
  abdi:  { pitch: 0.82, rate: 1.22, voiceHint: "male",   playbackRate: 1.22 },
  ahmed: { pitch: 0.88, rate: 1.24, voiceHint: "male",   playbackRate: 1.24 },
  dame:  { pitch: 0.78, rate: 1.25, voiceHint: "male",   playbackRate: 1.25 },
  rex:   { pitch: 0.74, rate: 1.20, voiceHint: "male",   playbackRate: 1.20 },
  prime: { pitch: 0.84, rate: 1.22, voiceHint: "male",   playbackRate: 1.22 },
  ayub:  { pitch: 0.86, rate: 1.26, voiceHint: "male",   playbackRate: 1.26 },
  atlas: { pitch: 0.9,  rate: 1.24, voiceHint: "male",   playbackRate: 1.24 },
  sygma: { pitch: 0.98, rate: 1.22, voiceHint: "female", playbackRate: 1.22 },
};

const AGENT_VOICE_PREFS: Record<string, string[]> = {
  abdi:  ["colm","connor","george","elliot","william","eric"],
  ahmed: ["prabhat","ravi","neerja","george","eric"],
  dame:  ["arthur","ryan","thomas","george","eric"],
  rex:   ["blake","liam","william","eric"],
  prime: ["daniel","arthur","george","oliver","guy","eric"],
  ayub:  ["prabhat","ravi","neerja","liam","eric"],
  atlas: ["caleb","connor","colm","ryan","eric"],
  sygma: ["clara","natasha","libby","aria","jenny"],
};

const QUICK_REACTIONS = ["❤️","😂","🔥","👍","💯","🎯","⚡","🤝"];

/* ─── Storage (server-synced) ─── */

// Local cache — used as initial seed while server loads
function loadConversationsLocal(): Conversation[] {
  try {
    const raw = localStorage.getItem(MSGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConversationsLocal(convs: Conversation[]) {
  try { localStorage.setItem(MSGS_KEY, JSON.stringify(convs)); } catch { /* ignore */ }
}

async function loadConversationsFromServer(): Promise<{ conversations: Conversation[]; updatedAt: string | null } | null> {
  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function saveConversationsToServer(convs: Conversation[]): Promise<void> {
  try {
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: convs }),
    });
  } catch { /* silent — localStorage is the fallback */ }
}

/* ─── Helpers ─── */


function agentInitial(name: string) {
  return name.slice(0, 1).toUpperCase();
}

function timeLabel(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffH = Math.floor(diffMins / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

function convPreview(conv: Conversation) {
  const last = conv.messages[conv.messages.length - 1];
  if (!last) return "No messages yet";
  const prefix = last.role === "user" ? "You: " : `${last.agentName || "Agent"}: `;
  return prefix + last.text.slice(0, 60) + (last.text.length > 60 ? "…" : "");
}

function convDisplayName(conv: Conversation, agentMap: Record<string, any>) {
  if (conv.type === "group") return conv.name;
  const ag = agentMap[conv.agentIds[0]];
  return ag?.name || conv.agentIds[0];
}

function inferUrgentCall(message: string) {
  return /\b(urgent|critical|immediately|right now|asap|emergency|down|outage|broken|failed|failure|lost|error)\b/i.test(message || "");
}

/* ─── Addressed Agent Detection ─── */

function detectAddressedAgent(text: string, agents: any[]): string | null {
  const lower = text.toLowerCase().trim();
  for (const agent of agents) {
    const name = (agent.name || agent.id).toLowerCase();
    if (
      lower.startsWith(name + ",") ||
      lower.startsWith(name + ":") ||
      lower.startsWith(name + " ") ||
      lower.startsWith("hey " + name) ||
      lower.startsWith("ok " + name) ||
      lower.startsWith("yo " + name) ||
      lower.startsWith("@" + name)
    ) {
      return agent.id;
    }
  }
  return null;
}

// Returns array of addressed agent IDs from text like "Prime and Atlas, ..." or "@Dame @Rex ..."
// Falls back to null (meaning: all agents) if no names are detected.
function detectAddressedAgents(text: string, agents: any[]): string[] | null {
  const lower = text.toLowerCase().trim();
  const names = agents.map(a => ({ id: a.id, name: (a.name || a.id).toLowerCase() }));

  // Collect all agent names mentioned at the start of the message (before a comma/colon or "...")
  // Strategy: scan the first ~60 chars for known names separated by "and", "&", commas, spaces, "@"
  const prefix = lower.slice(0, 80);
  const found: string[] = [];

  // Check for prefix patterns: "hey prime and atlas, ..." / "prime, atlas and dame: ..."
  // Strip leading interjections
  const stripped = prefix.replace(/^(hey|ok|yo|hi)\s+/, "");

  // Extract the addressing segment (everything before the first verb-y word or punctuation break)
  // Simple approach: split on " - " or on first word not a name/connector
  const connectors = /^[\s,@&]+|(\band\b|\bor\b)/;
  let seg = stripped;
  // Remove trailing "," ":" then split rest
  const colonIdx = seg.search(/[,:](?:\s|$)/);
  if (colonIdx > 0) seg = seg.slice(0, colonIdx);

  // tokenize by spaces, "and", "&", ",", "@"
  const tokens = seg.split(/[\s,@&]+|\band\b|\bor\b/).filter(Boolean);
  for (const tok of tokens) {
    const match = names.find(n => n.name === tok || tok.startsWith(n.name));
    if (match && !found.includes(match.id)) found.push(match.id);
  }

  // Also honor single-agent prefix patterns from detectAddressedAgent
  if (found.length === 0) {
    const single = detectAddressedAgent(text, agents);
    if (single) return [single];
    return null;
  }
  return found;
}

/* ─── Browser Speech ─── */

function speakText(text: string, agentId: string, onEnd: () => void) {
  window.speechSynthesis.cancel();
  const params = AGENT_SYNTH[agentId.toLowerCase()] ?? { pitch: 0.92, rate: 0.96, voiceHint: "male", playbackRate: 0.96 };
  const prefs = AGENT_VOICE_PREFS[agentId.toLowerCase()] ?? [];
  const knownFemale = ["zira","susan","female","woman","samantha","victoria","karen","moira","fiona",
    "aria","jenny","nova","shimmer","natasha","libby","neerja","google us english","google uk english female"];
  const knownMale = ["david","mark","daniel","guy","christopher","eric","ryan","william","prabhat",
    "liam","andrew","thomas","george","google uk english male"];

  const doSpeak = (voices: SpeechSynthesisVoice[]) => {
    const enVoices = voices.filter(v => v.lang.startsWith("en"));
    const all = enVoices.length ? enVoices : voices;
    const isFemale = (v: SpeechSynthesisVoice) => knownFemale.some(f => v.name.toLowerCase().includes(f));
    const isMale  = (v: SpeechSynthesisVoice) => knownMale.some(m => v.name.toLowerCase().includes(m));
    const wantFemale = params.voiceHint === "female";
    let pick: SpeechSynthesisVoice | null = null;
    for (const pref of prefs) { pick = all.find(v => v.name.toLowerCase().includes(pref)) ?? null; if (pick) break; }
    if (!pick) {
      pick = wantFemale
        ? (all.find(v => isFemale(v)) || all[0] || null)
        : (all.find(v => isMale(v)) || all.find(v => !isFemale(v)) || all[0] || null);
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = pick;
    utter.pitch = params.pitch;
    utter.rate  = params.rate;
    utter.volume = 1;
    utter.onend  = onEnd;
    utter.onerror = onEnd;
    window.speechSynthesis.speak(utter);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) { doSpeak(voices); return; }
  window.speechSynthesis.addEventListener("voiceschanged", function h() {
    window.speechSynthesis.removeEventListener("voiceschanged", h);
    doSpeak(window.speechSynthesis.getVoices());
  });
  setTimeout(() => doSpeak(window.speechSynthesis.getVoices()), 500);
}

/* ─── Agent Emojis (used in fullscreen conversation picker) ─── */

const AGENT_EMOJI: Record<string, string> = {
  abdi:  "👑",
  ahmed: "📊",
  dame:  "💻",
  rex:   "🛡️",
  prime: "📈",
  atlas: "🔗",
  ayub:  "⚙️",
  sygma: "✅",
};

function convEmoji(conv: Conversation, agentMap: Record<string, any>): string {
  return conv.agentIds
    .slice(0, 3)
    .map(id => AGENT_EMOJI[id.toLowerCase()] || "🤖")
    .join("");
}

/* ─── Agent SVG Icons ─── */

const AGENT_SVG: Record<string, React.ReactNode> = {
  abdi: ( // crown — leadership
    <><path d="M2 17h20l-2-10-5 5-3-8-3 8-5-5z"/><line x1="2" y1="17" x2="22" y2="17"/></>
  ),
  ahmed: ( // bar chart — analytics/data
    <><line x1="18" y1="20" x2="18" y2="9"/><line x1="12" y1="20" x2="12" y2="3"/><line x1="6" y1="20" x2="6" y2="13"/><line x1="3" y1="20" x2="21" y2="20"/></>
  ),
  dame: ( // terminal — tech/computer
    <><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></>
  ),
  rex: ( // shield — infra/protection
    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>
  ),
  prime: ( // trending up — finance/trading
    <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>
  ),
  atlas: ( // share nodes — AI/connections
    <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><line x1="8.5" y1="13.4" x2="15.5" y2="17.6"/><line x1="15.5" y1="6.4" x2="8.5" y2="10.6"/></>
  ),
  ayub: ( // code brackets — development
    <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>
  ),
  sygma: ( // shield + check — QA/compliance
    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>
  ),
};

/* ─── Avatar ─── */

function AgentAvatar({ agentId, name, size = 36 }: { agentId: string; name: string; size?: number }) {
  const color = agentColor(agentId);
  const icon = AGENT_SVG[agentId.toLowerCase()];
  const iconSize = Math.round(size * 0.62);

  return (
    <div style={{
      width: size, height: size,
      borderRadius: Math.round(size * 0.24),
      background: "transparent",
      border: `1px solid ${color}35`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {icon ? (
        <svg viewBox="0 0 24 24" width={iconSize} height={iconSize}
          fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      ) : (
        <span style={{ fontSize: size * 0.38, fontWeight: 700, color }}>{agentInitial(name)}</span>
      )}
    </div>
  );
}

/* ─── Group Avatar (stacked) ─── */

function GroupAvatar({ agentIds, agentMap, size = 36 }: { agentIds: string[]; agentMap: Record<string, any>; size?: number }) {
  const shown = agentIds.slice(0, 3);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {shown.map((id, i) => {
        const ag = agentMap[id];
        const color = agentColor(id);
        const offset = i * (size * 0.28);
        return (
          <div key={id} style={{
            position: "absolute", left: offset, top: offset,
            width: size * 0.65, height: size * 0.65, borderRadius: "50%",
            background: `${color}22`, border: `1.5px solid ${color}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: size * 0.24, fontWeight: 700, color,
            zIndex: shown.length - i,
          }}>
            {agentInitial(ag?.name || id)}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Reaction Picker ─── */

function ReactionPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: "absolute", bottom: "calc(100% + 8px)", left: 0,
      background: "var(--surface-raised)", border: "1px solid var(--border-strong)",
      borderRadius: 12, padding: "8px 10px", display: "flex", gap: 4,
      zIndex: 999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {QUICK_REACTIONS.map(e => (
        <button key={e} onClick={() => { onPick(e); onClose(); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: "2px 4px",
            borderRadius: 8, transition: "background 0.1s" }}
          onMouseEnter={ev => (ev.currentTarget.style.background = "var(--surface-active)")}
          onMouseLeave={ev => (ev.currentTarget.style.background = "none")}
        >{e}</button>
      ))}
    </div>
  );
}

/* ─── Message Content — Full Markdown Renderer ─── */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "relative", margin: "8px 0" }}>
      <pre style={{
        background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8, padding: "10px 14px", paddingRight: 64,
        fontSize: 12, lineHeight: 1.6, overflowX: "auto",
        margin: 0, color: "#e2e8f0", whiteSpace: "pre-wrap", wordBreak: "break-all",
        fontFamily: "var(--font-mono)",
      }}>{code}</pre>
      <button onClick={() => { navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }} style={{
        position: "absolute", top: 7, right: 7,
        background: copied ? "#22c55e22" : "rgba(255,255,255,0.07)",
        border: `1px solid ${copied ? "#22c55e66" : "rgba(255,255,255,0.13)"}`,
        borderRadius: 5, padding: "2px 8px", fontSize: 10.5, fontWeight: 600,
        color: copied ? "#86efac" : "var(--text-2)", cursor: "pointer",
        transition: "all 0.2s",
      }}>{copied ? "Copied!" : "Copy"}</button>
    </div>
  );
}

// Render a plain-text segment with inline bold, italic, links, inline-code
function renderInline(text: string, accentColor?: string): React.ReactNode {
  const key = () => Math.random().toString(36).slice(2);
  // Split on bold (**...**), italic (*...*), inline code (`...`), and URLs
  const RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`\n]+`|https?:\/\/[^\s<>"')\]]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0; let m: RegExpExecArray | null;
  RE.lastIndex = 0;
  while ((m = RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**") && tok.endsWith("**")) {
      parts.push(<strong key={key()} style={{ fontWeight: 700, color: accentColor || "inherit" }}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*") && tok.endsWith("*")) {
      parts.push(<em key={key()} style={{ fontStyle: "italic", opacity: 0.9 }}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith("`")) {
      const code = tok.slice(1, -1);
      parts.push(
        <code key={key()} onClick={() => navigator.clipboard.writeText(code)} title="Click to copy" style={{
          background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 4, padding: "1px 5px", fontSize: "0.88em",
          color: accentColor ? accentColor : "#fbbf24", cursor: "pointer", fontFamily: "var(--font-mono)",
        }}>{code}</code>
      );
    } else if (tok.startsWith("http")) {
      parts.push(
        <a key={key()} href={tok} target="_blank" rel="noreferrer"
          style={{ color: accentColor || "#60a5fa", textDecoration: "underline", wordBreak: "break-all" }}>
          {tok}
        </a>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? text : <>{parts}</>;
}

// Strip raw tool-call lines agents sometimes leak into replies (e.g. print(default_api.get_recent_logs(...)))
function stripToolCalls(raw: string): string {
  return raw
    .split("\n")
    .filter(line => {
      const t = line.trim();
      if (!t) return true; // keep blank lines (collapsed later)
      if (/^print\s*\(/.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/(?:^|\s)([a-z][a-z0-9_]{2,})\s*\([^)]*\)/gi, " that command ")
    .replace(/\b(call_user|desktop_[a-z0-9_]+|browser_[a-z0-9_]+|shell_command|apply_patch|send_input|spawn_agent|get_recent_logs)\b/gi, "that command")
    .replace(/^\s*that command\s*$/gim, "I ran that command.")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function MessageContent({ text: rawText, accentColor }: { text: string; accentColor?: string }) {
  const text = stripToolCalls(rawText);
  // ── Step 1: peel off fenced code blocks ──────────────────────────────────
  type Seg = { type: "code"; lang: string; body: string } | { type: "text"; body: string };
  const segs: Seg[] = [];
  const CODE_FENCE = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let lastIdx = 0; let cm: RegExpExecArray | null;
  CODE_FENCE.lastIndex = 0;
  while ((cm = CODE_FENCE.exec(text)) !== null) {
    if (cm.index > lastIdx) segs.push({ type: "text", body: text.slice(lastIdx, cm.index) });
    segs.push({ type: "code", lang: cm[1], body: cm[2].trim() });
    lastIdx = cm.index + cm[0].length;
  }
  if (lastIdx < text.length) segs.push({ type: "text", body: text.slice(lastIdx) });

  // ── Step 2: render each segment ──────────────────────────────────────────
  const out: React.ReactNode[] = [];
  let keyN = 0;
  const K = () => keyN++;

  for (const seg of segs) {
    if (seg.type === "code") { out.push(<CodeBlock key={K()} code={seg.body} />); continue; }

    // Parse lines for markdown structure
    const lines = seg.body.split("\n");
    type ListItem = { ordered: boolean; n: number; indent: number; text: string };
    type Block =
      | { type: "h1" | "h2" | "h3"; text: string }
      | { type: "hr" }
      | { type: "blank" }
      | { type: "li"; ordered: boolean; n: number; indent: number; text: string }
      | { type: "para"; text: string };

    const blocks: Block[] = [];
    for (const raw of lines) {
      const line = raw;
      if (/^#{3}\s/.test(line))          { blocks.push({ type: "h3", text: line.replace(/^###\s+/, "") }); continue; }
      if (/^#{2}\s/.test(line))          { blocks.push({ type: "h2", text: line.replace(/^##\s+/, "") }); continue; }
      if (/^#\s/.test(line))             { blocks.push({ type: "h1", text: line.replace(/^#\s+/, "") }); continue; }
      if (/^[-*─]{3,}$/.test(line.trim())) { blocks.push({ type: "hr" }); continue; }
      if (!line.trim())                  { blocks.push({ type: "blank" }); continue; }
      // ordered list: "1. " "  2. " etc.
      const olm = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
      if (olm) { blocks.push({ type: "li", ordered: true, n: parseInt(olm[2]), indent: olm[1].length, text: olm[3] }); continue; }
      // unordered list: "- " "• " "* "
      const ulm = line.match(/^(\s*)[•\-\*]\s+(.+)$/);
      if (ulm) { blocks.push({ type: "li", ordered: false, n: 0, indent: ulm[1].length, text: ulm[2] }); continue; }
      blocks.push({ type: "para", text: line });
    }

    // Flush list helper
    let listBuf: ListItem[] = [];
    let listOrdered = false;
    const flushList = () => {
      if (!listBuf.length) return;
      const Tag = listOrdered ? "ol" : "ul";
      out.push(
        <Tag key={K()} style={{
          margin: "6px 0", paddingLeft: 22,
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          {listBuf.map((it, idx) => (
            <li key={idx} style={{
              fontSize: 13, lineHeight: 1.6, color: "inherit",
              paddingLeft: it.indent > 0 ? 14 : 0,
            }}>
              {renderInline(it.text, accentColor)}
            </li>
          ))}
        </Tag>
      );
      listBuf = [];
    };

    for (const blk of blocks) {
      if (blk.type === "li") {
        if (listBuf.length && listOrdered !== blk.ordered) flushList();
        listOrdered = blk.ordered;
        listBuf.push(blk);
        continue;
      }
      flushList();

      if (blk.type === "blank") continue;
      if (blk.type === "hr") {
        out.push(<hr key={K()} style={{ border: "none", borderTop: `1px solid ${accentColor || "rgba(255,255,255,0.15)"}`, margin: "8px 0", opacity: 0.5 }} />);
        continue;
      }
      if (blk.type === "h1") {
        out.push(<div key={K()} style={{ fontSize: 15, fontWeight: 700, color: accentColor || "var(--text-1)", marginTop: 10, marginBottom: 4, letterSpacing: "-0.01em" }}>{renderInline(blk.text, accentColor)}</div>);
        continue;
      }
      if (blk.type === "h2") {
        out.push(<div key={K()} style={{ fontSize: 13.5, fontWeight: 700, color: accentColor || "var(--text-1)", marginTop: 8, marginBottom: 3, letterSpacing: "-0.01em" }}>{renderInline(blk.text, accentColor)}</div>);
        continue;
      }
      if (blk.type === "h3") {
        out.push(<div key={K()} style={{ fontSize: 12.5, fontWeight: 600, color: accentColor || "var(--text-2)", marginTop: 6, marginBottom: 2 }}>{renderInline(blk.text, accentColor)}</div>);
        continue;
      }
      if (blk.type === "para") {
        out.push(<p key={K()} style={{ margin: "3px 0", lineHeight: 1.65 }}>{renderInline(blk.text, accentColor)}</p>);
      }
    }
    flushList();
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>{out}</div>;
}

/* ─── Message Bubble ─── */

function MessageBubble({
  msg, agentMap, onReact,
}: {
  msg: ChatMessage;
  agentMap: Record<string, any>;
  onReact: (msgId: string, emoji: string) => void;
}) {
  const isUser = msg.role === "user";
  const [showPicker, setShowPicker] = useState(false);
  const agentId = msg.agentId || "";
  const color = agentColor(agentId);
  const agName = msg.agentName || agentMap[agentId]?.name || "Agent";

  const bubbleStyle: React.CSSProperties = isUser ? {
    background: "linear-gradient(180deg, rgba(84,20,20,0.9) 0%, rgba(34,12,14,0.96) 100%)",
    border: "1px solid rgba(239,68,68,0.26)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.24)",
    color: "rgba(250,244,244,0.94)",
    borderRadius: "20px 20px 8px 20px",
    alignSelf: "flex-end",
    maxWidth: "74%",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    opacity: 0.98,
  } : {
    background: "linear-gradient(180deg, rgba(17,22,30,0.94) 0%, rgba(11,15,22,0.98) 100%)",
    border: `1px solid ${color}33`,
    boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
    color: "rgba(232,237,243,0.9)",
    borderRadius: "20px 20px 20px 8px",
    alignSelf: "flex-start",
    maxWidth: "74%",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };

  const reactions = msg.reactions || [];
  const grouped: Record<string, number> = {};
  reactions.forEach(r => { grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}>
      <div style={{
        fontSize: 10.5,
        color: isUser ? "rgba(255,255,255,0.54)" : color,
        marginLeft: isUser ? 0 : 8,
        marginRight: isUser ? 6 : 0,
        marginBottom: 1,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}>
        {isUser ? "TASK" : agName}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexDirection: isUser ? "row-reverse" : "row" }}>
        {!isUser && <AgentAvatar agentId={agentId} name={agName} size={24} />}
        <div style={{ position: "relative" }}>
          <div
            id={`msg-${msg.id}`}
            style={{
              ...bubbleStyle, padding: "11px 14px", fontSize: 14, lineHeight: 1.7,
              fontFamily: "var(--font)", cursor: "default", userSelect: "text",
              ...(msg.id.startsWith("err-") ? {
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                color: "#fca5a5", cursor: "pointer",
              } : {}),
            }}
            onDoubleClick={() => setShowPicker(true)}
          >
            {msg.voiceNote && <span style={{ fontSize: 12, opacity: 0.7, marginRight: 6 }}>🎤</span>}
            <MessageContent text={msg.text} accentColor={isUser ? undefined : color} />
          </div>
          {showPicker && (
            <ReactionPicker onPick={(e) => onReact(msg.id, e)} onClose={() => setShowPicker(false)} />
          )}
        </div>
      </div>
      {/* Reactions row */}
      {Object.keys(grouped).length > 0 && (
        <div style={{ display: "flex", gap: 4, marginLeft: isUser ? 0 : 44, marginRight: isUser ? 4 : 0,
          flexDirection: isUser ? "row-reverse" : "row", flexWrap: "wrap" }}>
          {Object.entries(grouped).map(([emoji, count]) => (
            <button key={emoji} onClick={() => onReact(msg.id, emoji)}
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 20,
                padding: "2px 8px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              {emoji} <span style={{ color: "var(--text-2)", fontSize: 11 }}>{count}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", marginLeft: isUser ? 0 : 36, marginRight: isUser ? 4 : 0 }}>
        {timeLabel(msg.ts)}
      </div>
    </div>
  );
}

/* ─── Agent Sphere ─── */

function AgentSphere({ agentId, agState, emoji = "", size = 110 }: {
  agentId: string;
  agState: "idle" | "working" | "speaking";
  emoji?: string;
  size?: number;
}) {
  const color = agentColor(agentId);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `radial-gradient(circle at 35% 32%, ${color}ee 0%, ${color}99 38%, ${color}44 65%, ${color}0d 100%)`,
        boxShadow: agState === "speaking"
          ? `0 0 ${size * 0.45}px ${color}cc, 0 0 ${size * 0.9}px ${color}55, 0 0 ${size * 1.4}px ${color}22`
          : agState === "working"
          ? `0 0 ${size * 0.2}px ${color}66, 0 0 ${size * 0.5}px ${color}22`
          : `0 0 ${size * 0.1}px ${color}33`,
        animation: agState === "speaking" ? "spherePulse 1.4s ease-in-out infinite"
                 : agState === "working"  ? "sphereBreathe 2.6s ease-in-out infinite"
                 : "none",
        transition: "box-shadow 0.55s ease",
      }} />
      {emoji && (
        <div style={{
          position: "absolute", top: -6, right: -6,
          fontSize: Math.round(size * 0.32),
          lineHeight: 1,
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.7))",
          pointerEvents: "none",
          userSelect: "none",
        }}>{emoji}</div>
      )}
    </div>
  );
}

/* ─── Live Call Overlay ─── */

function CallOverlay({
  callAgents, agentMap, onHangUp, onMessage, initialMessage, initialAgentId, onAddAgent, allAgentIds,
  inlineCallQueue, dismissInlineCall, onUserMessage,
}: {
  callAgents: any[];
  agentMap: Record<string, any>;
  onHangUp: () => void;
  onMessage: (text: string, agentId: string, agentObj: any) => void;
  onUserMessage?: (text: string, targets: any[]) => void;
  initialMessage?: string;
  initialAgentId?: string;
  onAddAgent?: (agentId: string) => void;
  allAgentIds?: string[];
  inlineCallQueue?: Array<{ agentId: string; agentName: string; message: string; withAgents?: string[]; urgent?: boolean }>;
  dismissInlineCall?: (agentId: string) => void;
}) {
  const [agentStates, setAgentStates] = useState<Record<string, "idle"|"working"|"speaking">>(() => {
    const init: Record<string, "idle"|"working"|"speaking"> = {};
    callAgents.forEach(a => { init[a.id.toLowerCase()] = "idle"; });
    return init;
  });
  const [agentEmojis, setAgentEmojis] = useState<Record<string, string>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [holdActive, setHoldActive] = useState(false);
  const isMutedRef = useRef(false);
  const holdActiveRef = useRef(false);
  const [liveText, setLiveText] = useState("");
  const [callMessages, setCallMessages] = useState<{ from: string; text: string; isUser?: boolean }[]>([]);
  const [callInput, setCallInput] = useState("");
  const [targetedAgentIds, setTargetedAgentIds] = useState<string[]>([]);
  const targetedAgentRef = useRef<string[]>([]);
  const callInputRef = useRef<HTMLInputElement>(null);
  const callMsgEndRef = useRef<HTMLDivElement>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recogRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const ttsCountRef = useRef(0);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({}); // kept for legacy teardown compat
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const endedRef = useRef(false);
  const bootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentSpeakingRef = useRef(false); // true while audio is playing — blocks VAD barge-in
  const flushOnHoldReleaseRef = useRef(false); // set to true when Shift released so VAD flushes immediately
  const turnIdRef = useRef(0); // incremented on every new user utterance — stale agent turns drop silently

  const hasPrime = callAgents.some(a => a.id.toLowerCase() === "prime");
  const [screenSnapshot, setScreenSnapshot] = useState<string | null>(null);
  const [screenError, setScreenError] = useState(false);
  const screenSnapshotRef = useRef<string | null>(null);
  const lastFiredRef = useRef(""); // prevent double-firing same phrase
  const interimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const mrStreamRef = useRef<MediaStream | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const speechRecogRef = useRef<any>(null);

  const setAgentState = (id: string, s: "idle"|"working"|"speaking") =>
    setAgentStates(prev => ({ ...prev, [id.toLowerCase()]: s }));

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // Timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() =>
      setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Screen share — active for all calls so every agent can see context
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch("/api/screen/snapshot");
        if (cancelled) return;
        if (!r.ok) { setScreenError(true); return; }
        const d = await r.json();
        if (d?.base64 && d?.mime) {
          const snap = `data:${d.mime};base64,${d.base64}`;
          setScreenSnapshot(snap);
          screenSnapshotRef.current = snap;
          setScreenError(false);
        } else if (d?.error) {
          setScreenError(true);
        }
      } catch { setScreenError(true); }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => { cancelled = true; clearInterval(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Forward-declared so fireToAgent can reference it
  const startListeningRef = useRef<() => void>(() => {});
  // True while agents are fetching/speaking — blocks mic restart
  const isFetchingRef = useRef(false);
  // Set to true on barge-in to abort sequential group playback
  const ttsAbortRef = useRef(false);

  // Interrupt all playing TTS immediately (barge-in)
  const interruptTTS = useCallback(() => {
    ttsAbortRef.current = true; // abort sequential loop
    ttsCountRef.current = 0;
    agentSpeakingRef.current = false;
    try { activeSourceRef.current?.stop(); activeSourceRef.current = null; } catch { /* ok */ }
    window.speechSynthesis.cancel();
    setAgentStates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (next[k] === "speaking") next[k] = "idle"; });
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const teardownCall = useCallback((updateUi: boolean) => {
    endedRef.current = true;
    ttsAbortRef.current = true;
    isFetchingRef.current = false;
    agentSpeakingRef.current = false;
    listeningRef.current = false;
    recogRef.current?.abort?.();
    recogRef.current?.stop?.();
    recogRef.current = null;
    if (interimTimerRef.current) {
      clearTimeout(interimTimerRef.current);
      interimTimerRef.current = null;
    }
    if (speechRecogRef.current) {
      try { speechRecogRef.current.stop(); } catch { /* ok */ }
      speechRecogRef.current = null;
    }
    if (bootTimerRef.current) {
      clearTimeout(bootTimerRef.current);
      bootTimerRef.current = null;
    }
    window.speechSynthesis.cancel();
    try { activeSourceRef.current?.stop(); activeSourceRef.current = null; } catch { /* ok */ }
    try { audioCtxRef.current?.close(); audioCtxRef.current = null; } catch { /* ok */ }
    if (updateUi) {
      setIsListening(false);
      setLiveText("");
      setAgentStates((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => { next[key] = "idle"; });
        return next;
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Play one sentence — uses Web Audio API (decodeAudioData + BufferSource) which is
  // immune to Chrome's HTMLAudioElement autoplay blocking mid-call.
  // Falls back to browser SpeechSynthesis if server TTS is unavailable.
  const playSentence = useCallback(async (sentence: string, agent: any): Promise<void> => {
    const aid = agent.id.toLowerCase();
    const agentParams = AGENT_SYNTH[aid];
    if (ttsAbortRef.current) return;

    // Fetch audio from server TTS
    let buf: ArrayBuffer | null = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 18000);
      let res: Response;
      try {
        res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: agent.id, text: sentence }),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(t); }
      if (res.ok) buf = await res.arrayBuffer();
      else console.warn(`[TTS] ${aid} HTTP ${res.status}`);
    } catch (e: any) {
      console.warn(`[TTS] ${aid} fetch error:`, e?.message);
    }

    if (ttsAbortRef.current) return;

    // Play via Web Audio API if we got audio bytes
    if (buf && buf.byteLength) {
      const ctx = audioCtxRef.current;
      if (ctx) {
        try {
          await ctx.resume();
          const decoded = await ctx.decodeAudioData(buf);
          if (ttsAbortRef.current) return;
          await new Promise<void>((resolve) => {
            const src = ctx.createBufferSource();
            src.buffer = decoded;
            src.playbackRate.value = agentParams?.playbackRate ?? 1.0;
            const gainNode = ctx.createGain();
            gainNode.gain.value = AGENT_VOLUME[aid] ?? 1.0;
            src.connect(gainNode);
            gainNode.connect(ctx.destination);
            src.onended = () => { activeSourceRef.current = null; agentSpeakingRef.current = false; resolve(); };
            activeSourceRef.current = src;
            agentSpeakingRef.current = true;
            src.start(0);
          });
          return;
        } catch (e: any) {
          console.warn(`[TTS] ${aid} WebAudio error:`, e?.message);
        }
      }
    }

    // Browser SpeechSynthesis fallback — used when server TTS unavailable
    if (ttsAbortRef.current) return;
    await new Promise<void>((resolve) => {
      const params = agentParams ?? { pitch: 0.92, rate: 1.1, voiceHint: "male", playbackRate: 1.1 };
      const prefs = AGENT_VOICE_PREFS[aid] ?? [];
      const knownFemale = ["zira","susan","female","woman","samantha","victoria","karen","moira","fiona",
        "aria","jenny","nova","shimmer","natasha","libby","neerja","google us english","google uk english female"];
      const knownMale = ["david","mark","daniel","guy","christopher","eric","ryan","william","prabhat",
        "liam","andrew","thomas","george","google uk english male"];
      const doSpeak = (voices: SpeechSynthesisVoice[]) => {
        if (ttsAbortRef.current) { resolve(); return; }
        const enVoices = voices.filter(v => v.lang.startsWith("en"));
        const all = enVoices.length ? enVoices : voices;
        const isFemale = (v: SpeechSynthesisVoice) => knownFemale.some(f => v.name.toLowerCase().includes(f));
        const isMale  = (v: SpeechSynthesisVoice) => knownMale.some(m => v.name.toLowerCase().includes(m));
        const wantFemale = params.voiceHint === "female";
        let pick: SpeechSynthesisVoice | null = null;
        for (const pref of prefs) { pick = all.find(v => v.name.toLowerCase().includes(pref)) ?? null; if (pick) break; }
        if (!pick) pick = wantFemale ? (all.find(v => isFemale(v)) || all[0] || null) : (all.find(v => isMale(v)) || all.find(v => !isFemale(v)) || all[0] || null);
        const utter = new SpeechSynthesisUtterance(sentence);
        utter.voice = pick;
        utter.pitch = params.pitch;
        utter.rate  = Math.min(params.rate * 1.1, 1.9); // boost rate, cap at 1.9
        utter.volume = AGENT_VOLUME[aid] ?? 1.0;
        utter.onend  = () => { agentSpeakingRef.current = false; resolve(); };
        utter.onerror = () => { agentSpeakingRef.current = false; resolve(); };
        window.speechSynthesis.cancel();
        agentSpeakingRef.current = true;
        window.speechSynthesis.speak(utter);
      };
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) { doSpeak(voices); return; }
      window.speechSynthesis.addEventListener("voiceschanged", function h() {
        window.speechSynthesis.removeEventListener("voiceschanged", h);
        doSpeak(window.speechSynthesis.getVoices());
      });
      setTimeout(() => doSpeak(window.speechSynthesis.getVoices()), 400);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Returns a Promise that resolves only when agent is fully done speaking
  const fireToAgent = useCallback(async (text: string, agent: any): Promise<void> => {
    if (endedRef.current) return;
    const myTurn = turnIdRef.current; // snapshot — if this changes, our response is stale
    const aid = agent.id.toLowerCase();
    setAgentState(aid, "working");
    setAgentEmojis(prev => ({ ...prev, [aid]: "" })); // clear ✋ when their turn starts
    try {
      const chatBody: any = { agentId: agent.id, message: text, callAgentCount: callAgents.length };
      if (screenSnapshotRef.current) chatBody.snapshot = screenSnapshotRef.current;
      const controller = new AbortController();
      // 90s — enough for multi-tool-call chains (research, file ops, API calls)
      const to = setTimeout(() => controller.abort(), 90_000);
      let res: Response;
      try {
        res = await fetch("/api/voice/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chatBody), signal: controller.signal,
        });
      } finally { clearTimeout(to); }
      const json = await res.json();
      const rawReply: string = (json.reply || json.text || "").trim();
      // Drop if user started speaking again while we were fetching (stale turn)
      if (turnIdRef.current !== myTurn || ttsAbortRef.current || endedRef.current) {
        setAgentState(aid, "idle");
        return;
      }
      // Agent chose to stay silent in conference
      if (!rawReply || rawReply === "[SILENT]") {
        setAgentState(aid, "idle");
        return;
      }
      const reply = rawReply;
      onMessage(reply, agent.id, agent);
      setCallMessages(prev => [...prev, { from: agent.name || agent.id, text: reply }]);
      setAgentState(aid, "speaking");

      // Stop mic while agent speaks so it doesn't hear itself
      recogRef.current?.stop();
      recogRef.current = null;
      listeningRef.current = false;
      setIsListening(false);

      // Play the full reply in one stream to avoid awkward pauses between sentences.
      if (!ttsAbortRef.current && !endedRef.current) {
        await playSentence(reply, agent);
      }

      if (!endedRef.current) {
        setAgentState(aid, "idle");
        // Restart mic after agent finishes speaking — short delay so speaker echo clears
        setTimeout(() => startListeningRef.current(), 120);
      }
    } catch (err: any) {
      if (endedRef.current || turnIdRef.current !== myTurn) { setAgentState(aid, "idle"); return; }
      // Speak an error so there's never dead silence — user always hears something
      const errMsg = err?.name === "AbortError"
        ? "That took too long, I timed out. Try again."
        : "I hit an error on that one. Try again.";
      setCallMessages(prev => [...prev, { from: agent.name || agent.id, text: errMsg }]);
      setAgentState(aid, "speaking");
      await playSentence(errMsg, agent);
      setAgentState(aid, "idle");
      if (!endedRef.current) setTimeout(() => startListeningRef.current(), 120);
    }
  }, [onMessage, playSentence]); // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = useCallback(() => {
    if (endedRef.current || listeningRef.current || isFetchingRef.current) return;
    listeningRef.current = true;
    setIsListening(true);
    setLiveText("");

    const fireNow = (text: string) => {
      const t = text.trim();
      if (!t || t === lastFiredRef.current) return;
      lastFiredRef.current = t;
      if (interimTimerRef.current) { clearTimeout(interimTimerRef.current); interimTimerRef.current = null; }
      setLiveText("");
      setCallMessages(prev => [...prev, { from: "You", text: t, isUser: true }]);
      // Hard-abort any agent that is still speaking or fetching from the previous turn
      ttsAbortRef.current = true;
      agentSpeakingRef.current = false;
      isFetchingRef.current = false;
      try { activeSourceRef.current?.stop(); activeSourceRef.current = null; } catch { /* ok */ }
      window.speechSynthesis.cancel();
      turnIdRef.current += 1; // invalidate any in-flight agent responses

      let targets: any[];
      if (targetedAgentRef.current.length > 0) {
        targets = callAgents.filter(a => targetedAgentRef.current.includes(a.id.toLowerCase()));
      } else {
        const addressedId = detectAddressedAgent(t, callAgents);
        targets = addressedId
          ? callAgents.filter(a => a.id.toLowerCase() === addressedId.toLowerCase())
          : callAgents;
      }

      onUserMessage?.(t, targets);
      setAgentEmojis(() => {
        const next: Record<string, string> = {};
        callAgents.forEach(a => {
          const aid = a.id.toLowerCase();
          const idx = targets.findIndex((tgt: any) => tgt.id.toLowerCase() === aid);
          if (idx > 0) next[aid] = "✋";
          else if (idx === -1) next[aid] = "👂";
        });
        return next;
      });

      // Stop mic while agent fetches + speaks
      if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
      if (mrRef.current && mrRef.current.state !== "inactive") mrRef.current.stop();
      mrStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      mrStreamRef.current = null;
      recogRef.current = null;
      listeningRef.current = false;
      setIsListening(false);

      isFetchingRef.current = true;
      ttsAbortRef.current = false; // clear abort flag — new turn is clean
      (async () => {
        for (const ag of targets) {
          if (ttsAbortRef.current || endedRef.current) break;
          await fireToAgent(t, ag);
        }
        setAgentEmojis({});
        isFetchingRef.current = false;
        ttsAbortRef.current = false;
        lastFiredRef.current = "";
      })();
    };

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream: MediaStream) => {
      if (endedRef.current) { stream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); return; }
      mrStreamRef.current = stream;

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        try {
          const speechRecog = new SR();
          speechRecogRef.current = speechRecog;
          speechRecog.continuous = true;
          speechRecog.interimResults = true;
          speechRecog.lang = "en-US";
          let srAccumulated = "";
          let srSilenceTimer: ReturnType<typeof setTimeout> | null = null;
          speechRecog.onresult = (event: any) => {
            if (endedRef.current || isMutedRef.current) return;
            let interim = "";
            let finalText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const chunk = String(event.results[i][0]?.transcript || "").trim();
              if (!chunk) continue;
              if (event.results[i].isFinal) {
                finalText += ` ${chunk}`;
              } else {
                interim += ` ${chunk}`;
              }
            }

            if (finalText.trim()) srAccumulated += ` ${finalText.trim()}`;
            const live = `${srAccumulated} ${interim}`.trim();
            if (live) setLiveText(live);

            // Reset 5s silence timer on every new speech — fire only after silence
            if (srSilenceTimer) clearTimeout(srSilenceTimer);
            if (srAccumulated.trim() && !holdActiveRef.current) {
              srSilenceTimer = setTimeout(() => {
                if (endedRef.current || holdActiveRef.current) return;
                const toFire = srAccumulated.trim();
                srAccumulated = "";
                if (toFire) { speechRecogRef.current = null; fireNow(toFire); stopEverything(); }
              }, 5000);
            }
          };
          speechRecog.onerror = () => {
            speechRecogRef.current = null;
          };
          speechRecog.onend = () => {
            if (speechRecogRef.current === speechRecog) {
              speechRecogRef.current = null;
            }
          };
          speechRecog.start();
        } catch {
          speechRecogRef.current = null;
        }
      }

      // VAD using Web Audio analyser
      const vadCtx = new AudioContext();
      const source = vadCtx.createMediaStreamSource(stream);
      const analyser = vadCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);

      let hasSpeech = false;
      let silenceStart: number | null = null;
      let recording = false;
      let cancelled = false;
      let recordingStartedAt = 0;
      let noiseFloor = 0.008;

      const stopEverything = () => {
        cancelled = true;
        if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
        if (speechRecogRef.current) {
          try { speechRecogRef.current.stop(); } catch { /* ok */ }
          speechRecogRef.current = null;
        }
        vadCtx.close().catch(() => {});
        if (mrRef.current && mrRef.current.state !== "inactive") mrRef.current.stop();
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        mrStreamRef.current = null;
        listeningRef.current = false;
        setIsListening(false);
      };

      const startRecording = () => {
        if (recording || cancelled) return;
        audioChunksRef.current = [];
        const mimeType = (MediaRecorder as any).isTypeSupported?.("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus" : "audio/webm";
        const mr = new MediaRecorder(stream, { mimeType });
        mrRef.current = mr;
        recordingStartedAt = Date.now();
        mr.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        mr.onstop = async () => {
          recording = false;
          if (cancelled) return;
          const chunks = audioChunksRef.current;
          audioChunksRef.current = [];
          if (!chunks.length) return;
          try {
            const mimeType =
              mrRef.current?.mimeType ||
              (chunks[0] instanceof Blob && chunks[0].type) ||
              "audio/webm";
            const blob = new Blob(chunks, { type: mimeType });
            const res = await fetch("/api/voice/stt", {
              method: "POST",
              headers: { "Content-Type": mimeType },
              body: blob,
            });
            if (!res.ok || cancelled) {
              const errorText = await res.text().catch(() => "");
              console.warn("[STT] call transcription failed", res.status, errorText);
              if (!cancelled) {
                setLiveText("Mic transcription failed. Listening again…");
                startRecording();
              }
              return;
            }
            const { text } = await res.json();
            const trimmed = (text || "").trim();
            const wc = trimmed.split(/\s+/).filter(Boolean).length;
            if (trimmed && wc >= 1) {
              setLiveText(trimmed);
              fireNow(trimmed);
            } else if (!cancelled) {
              // Short/empty result — restart recording for next utterance
              startRecording();
            }
          } catch { if (!cancelled) startRecording(); }
        };
        mr.start();
        recording = true;
      };

      startRecording();

      vadIntervalRef.current = setInterval(() => {
        if (cancelled) return;
        analyser.getByteFrequencyData(dataArray);
        analyser.getByteTimeDomainData(timeData);
        const avg = dataArray.reduce((s: number, v: number) => s + v, 0) / dataArray.length;
        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i++) {
          const normalized = (timeData[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        noiseFloor = Math.min(0.05, noiseFloor * 0.96 + Math.min(rms, 0.04) * 0.04);
        const speechThreshold = Math.max(0.012, noiseFloor * 2.1);
        const isSpeaking = rms > speechThreshold || avg > 6;

        if (isMutedRef.current) { setLiveText("🔇 Muted"); return; }

        if (isSpeaking) {
          hasSpeech = true;
          silenceStart = null;
          // Don't barge-in or record while agent is speaking — mic hears the speaker
          if (agentSpeakingRef.current) return;
          if (!recording) startRecording();
          setLiveText(prev => prev && prev !== "Mic transcription failed. Listening again…" ? prev : "…");
          // Barge-in only while agent is fetching (thinking), not while actually playing audio
          if (isFetchingRef.current && !agentSpeakingRef.current) {
            interruptTTS();
            ttsAbortRef.current = true;
            isFetchingRef.current = false;
            lastFiredRef.current = "";
          }
        } else if (recording) {
          if (!silenceStart) silenceStart = Date.now();
          const elapsed = Date.now() - recordingStartedAt;
          // Flush immediately when Shift released (hold OFF)
          const holdReleased = flushOnHoldReleaseRef.current;
          if (holdReleased) flushOnHoldReleaseRef.current = false;
          // Hold mode = user hasn't released shift = never fire, just keep buffering
          const shouldFlushForPause =
            holdReleased || (!holdActiveRef.current && (
              (hasSpeech && Date.now() - silenceStart > 5000) ||
              (!hasSpeech && elapsed > 6000)
            ));
          const shouldFlushForWindow = !holdActiveRef.current && elapsed > 15000;
          if (shouldFlushForPause || shouldFlushForWindow) {
            hasSpeech = false;
            silenceStart = null;
            setLiveText("");
            if (mrRef.current && mrRef.current.state === "recording") mrRef.current.stop();
          }
        }
      }, 80);

      recogRef.current = { stop: stopEverything, abort: stopEverything };
    }).catch((err: Error) => {
      listeningRef.current = false;
      setIsListening(false);
      setLiveText(`Mic: ${err.message}`);
    });

    // ── legacy SpeechRecognition block removed — replaced with VAD + Whisper above ──
    // Kept stub to avoid dead code below
    if (false) {
      const interim = "";
      const wordCount = interim.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount >= 4 && interim.trim() !== lastFiredRef.current) {
        if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
        interimTimerRef.current = setTimeout(() => {
          interimTimerRef.current = null;
        }, 1800);
      }
    } // end if(false) stub
  }, [callAgents, fireToAgent, interruptTTS, onUserMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ref up to date
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // Keep isMutedRef in sync with state so onresult closure sees latest value
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { holdActiveRef.current = holdActive; }, [holdActive]);

  // Auto-announce inline-queued messages from other agents during this call
  useEffect(() => {
    if (!inlineCallQueue?.length) return;
    setAgentEmojis(prev => {
      const next = { ...prev };
      inlineCallQueue.forEach(item => {
        const aid = item.agentId.toLowerCase();
        if (agentStates[aid] !== "speaking") next[aid] = item.urgent ? "✋!" : "✋";
      });
      return next;
    });
  }, [agentStates, inlineCallQueue]);

  useEffect(() => {
    if (!inlineCallQueue?.length || isFetchingRef.current || endedRef.current) return;
    const next = inlineCallQueue[0];
    dismissInlineCall?.(next.agentId);
    const ag = agentMap[next.agentId] || { id: next.agentId, name: next.agentName };
    const announcement = next.urgent
      ? `${next.agentName} has their hand up with something urgent. ${next.message}`
      : `${next.agentName} has their hand up. ${next.message}`;
    setCallMessages(prev => [...prev, { from: next.agentName, text: next.message }]);
    if (listeningRef.current) {
      recogRef.current?.stop();
      recogRef.current = null;
      listeningRef.current = false;
      setIsListening(false);
    }
    isFetchingRef.current = true;
    ttsAbortRef.current = false;
    (async () => {
      await fireToAgent(announcement, ag);
      isFetchingRef.current = false;
      ttsAbortRef.current = false;
    })();
  }, [inlineCallQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start + create AudioContext during the user-gesture that opened the call
  useEffect(() => {
    // Create a shared AudioContext now, while we're still in the user-gesture frame
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      audioCtxRef.current.resume().catch(() => {});
    }

    // If agent called us with an initial message, speak it first then start listening
    if (initialMessage && initialAgentId) {
      const agent = callAgents.find(a => a.id.toLowerCase() === initialAgentId.toLowerCase())
        || { id: initialAgentId, name: initialAgentId };
      isFetchingRef.current = true;
      (async () => {
        await fireToAgent(initialMessage, agent);
        isFetchingRef.current = false;
      })();
    } else {
      bootTimerRef.current = setTimeout(() => startListeningRef.current(), 800);
    }

    return () => {
      teardownCall(false);
    };
  }, [teardownCall]); // eslint-disable-line react-hooks/exhaustive-deps

  const anySpeaking = Object.values(agentStates).some(s => s === "speaking");
  const anyWorking  = Object.values(agentStates).some(s => s === "working");
  const singleAgent = callAgents.length === 1;
  // Use a state-driven version of isFetchingRef so status label updates
  const [agentsBusy, setAgentsBusy] = useState(false);
  // Sync isFetchingRef → agentsBusy for display
  useEffect(() => {
    const id = setInterval(() => setAgentsBusy(isFetchingRef.current), 250);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() || "";
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable;

      if (e.key === "Shift" && !e.repeat) {
        e.preventDefault();
        setHoldActive((prev) => {
          const next = !prev;
          if (next && !isMutedRef.current) {
            startListeningRef.current();
          } else if (!next) {
            // Hold released — signal VAD to flush whatever was buffered
            flushOnHoldReleaseRef.current = true;
          }
          return next;
        });
        return;
      }

      if (isTypingTarget) return;

      if (e.key.toLowerCase() === "m" && !e.repeat) {
        e.preventDefault();
        setIsMuted((prev) => !prev);
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        teardownCall(true);
        onHangUp();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onHangUp, teardownCall]);

  // Auto-scroll message history
  useEffect(() => {
    callMsgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [callMessages]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.93)", backdropFilter: "blur(24px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 18,
      padding: "20px 16px 160px 16px",
      overflowY: "auto",
    }}>
      <style>{`
        @keyframes spherePulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.9; }
        }
        @keyframes sphereBreathe {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes rippleCall {
          0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.65; }
          100% { transform: translate(-50%,-50%) scale(1.85); opacity: 0; }
        }
      `}</style>

      {/* Small top spacer to push sphere down */}
      <div style={{ height: 16 }} />

      {/* Spheres */}
      <div style={{
        display: "flex", flexDirection: "row", gap: singleAgent ? 0 : 28,
        alignItems: "flex-end", justifyContent: "center", flexWrap: "wrap",
      }}>
        {callAgents.map(agent => {
          const aid = agent.id.toLowerCase();
          const agState = agentStates[aid] || "idle";
          const color = agentColor(aid);
          const sphereSize = singleAgent ? 130 : 88;
          return (
            <div key={aid} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              {/* Sphere with listening ripples */}
              <div style={{ position: "relative", width: sphereSize, height: sphereSize }}>
                <AgentSphere agentId={aid} agState={agState} emoji={agentEmojis[aid] || ""} size={sphereSize} />
                {/* Ripple rings when user is speaking */}
                {isListening && [0, 0.42, 0.84].map((delay, i) => (
                  <div key={i} style={{
                    position: "absolute",
                    top: "50%", left: "50%",
                    width: sphereSize, height: sphereSize,
                    borderRadius: "50%",
                    border: `1.5px solid ${color}`,
                    animation: "rippleCall 1.4s ease-out infinite",
                    animationDelay: `${delay}s`,
                    pointerEvents: "none",
                  }} />
                ))}
              </div>

              {/* Name + Hold button */}
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    onClick={!singleAgent ? () => {
                      const isSelected = targetedAgentIds.includes(aid);
                      const next = isSelected
                        ? targetedAgentIds.filter(id => id !== aid)
                        : [...targetedAgentIds, aid];
                      setTargetedAgentIds(next);
                      targetedAgentRef.current = next;
                    } : undefined}
                    style={{
                      fontSize: singleAgent ? 20 : 14, fontWeight: 700, color,
                      cursor: singleAgent ? "default" : "pointer",
                      padding: !singleAgent ? "2px 8px" : undefined,
                      borderRadius: !singleAgent ? 8 : undefined,
                      background: !singleAgent && targetedAgentIds.includes(aid) ? `${color}22` : "transparent",
                      border: !singleAgent && targetedAgentIds.includes(aid) ? `1px solid ${color}55` : "1px solid transparent",
                      transition: "all 0.15s",
                    }}
                  >{agent.name || agent.id}</div>

                  {/* Hold-to-talk: keep mic open through pauses */}
                  {singleAgent && (
                    <button
                      title="Toggle hands-free hold mode — click once or press Shift"
                      style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        letterSpacing: "0.05em", cursor: "pointer", userSelect: "none",
                        border: holdActive ? "1px solid rgba(34,197,94,0.65)" : isListening ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.14)",
                        background: holdActive ? "rgba(34,197,94,0.18)" : isListening ? "rgba(255,255,255,0.1)" : "transparent",
                        color: holdActive ? "#f3f4f6" : "rgba(255,255,255,0.55)",
                        transform: holdActive ? "scale(1.16)" : isListening ? "scale(1.12)" : "scale(1)",
                        boxShadow: holdActive ? "0 0 18px rgba(34,197,94,0.32), inset 0 0 8px rgba(34,197,94,0.18)" : isListening ? "0 0 10px rgba(255,255,255,0.15), inset 0 0 6px rgba(255,255,255,0.06)" : "none",
                        transition: "all 0.12s",
                      }}
                      onClick={() => {
                        setHoldActive((prev) => {
                          const next = !prev;
                          if (next && !isMutedRef.current) startListeningRef.current();
                          else if (!next) flushOnHoldReleaseRef.current = true;
                          return next;
                        });
                      }}
                    >{holdActive ? "◉ Hold" : "Hold"}</button>
                  )}
                </div>

                <div style={{ fontSize: 11, color: "var(--text-3)", minHeight: 16 }}>
                  {targetedAgentIds.includes(aid) ? "private" : agState === "speaking" ? "speaking" : agState === "working" ? "working…" : ""}
                </div>
                {singleAgent && (
                  <div style={{
                    marginTop: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    alignSelf: "center",
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    color: holdActive ? "#f3f4f6" : "rgba(255,255,255,0.72)",
                    background: holdActive ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.06)",
                    border: holdActive ? "1px solid rgba(34,197,94,0.55)" : "1px solid rgba(255,255,255,0.1)",
                    boxShadow: holdActive ? "0 0 18px rgba(34,197,94,0.22)" : "none",
                  }}>
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: holdActive ? "#22c55e" : "rgba(255,255,255,0.45)",
                      boxShadow: holdActive ? "0 0 10px rgba(34,197,94,0.65)" : "none",
                    }} />
                    {holdActive ? "Hold mode active — pauses are safe" : "Shift toggles hold • M mutes • Space ends call"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add agent to call */}
      {onAddAgent && allAgentIds && allAgentIds.filter(id => !callAgents.some(a => a.id.toLowerCase() === id.toLowerCase())).length > 0 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
          {allAgentIds.filter(id => !callAgents.some(a => a.id.toLowerCase() === id.toLowerCase())).map(id => {
            const ag = agentMap[id];
            const color = agentColor(id);
            return (
              <button key={id} onClick={() => onAddAgent(id)} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 20,
                background: `${color}18`, border: `1px solid ${color}44`,
                color, cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}>
                <AgentAvatar agentId={id} name={ag?.name || id} size={18} />
                + {ag?.name || id}
              </button>
            );
          })}
        </div>
      )}

      {/* Duration & mic status */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>{formatDuration(callDuration)}</div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 5, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: isListening ? "#22c55e" : "#444", display: "inline-block", transition: "background 0.3s" }} />
          {isListening ? "Listening" : anySpeaking ? "Speaking" : anyWorking || agentsBusy ? "Thinking…" : "Listening"}
        </div>
      </div>


      {/* Screen share — all agents */}
      <div style={{
        width: 400, maxWidth: "88vw",
        background: "var(--surface-raised)", border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 14, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 14px", borderBottom: "1px solid var(--border)",
          fontSize: 11, color: "var(--text-2)",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block",
            background: screenSnapshot ? "#22c55e" : screenError ? "var(--red)" : "#555" }} />
          {screenSnapshot
            ? `${callAgents.map(a => a.name || a.id).join(" & ")} can see your screen`
            : screenError ? "Screen capture unavailable — is the relay running?"
            : "Connecting screen share…"}
        </div>
        {screenSnapshot ? (
          <img src={screenSnapshot} alt="Live screen"
            style={{ width: "100%", display: "block", maxHeight: 200, objectFit: "contain", background: "#000" }} />
        ) : (
          <div style={{ height: 90, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-3)" }}>
            {screenError ? "Start relay/relay.js to enable screen context" : "Capturing…"}
          </div>
        )}
      </div>

      <div style={{
        position: "absolute",
        left: 24,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 18,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "center",
        padding: 12,
        borderRadius: 22,
        background: "rgba(7,10,18,0.84)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 18px 44px rgba(0,0,0,0.42)",
        backdropFilter: "blur(16px)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setIsMuted(m => !m)}
            style={{
              width: 60, height: 60, borderRadius: "50%",
              background: isMuted ? "#1a1a1a" : "rgba(255,255,255,0.12)",
              border: isMuted ? "2px solid var(--red)" : "2px solid rgba(255,255,255,0.2)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, transition: "all 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          >{isMuted ? "🔇" : "🎙️"}</button>
          <div style={{ fontSize: 12, color: isMuted ? "var(--red)" : "var(--text-2)", fontWeight: 600 }}>
            {isMuted ? "Muted" : "Mute"}
          </div>
        </div>

        <div style={{ width: 36, height: 1, background: "rgba(255,255,255,0.08)" }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button onClick={() => { teardownCall(true); onHangUp(); }} style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "var(--red)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, boxShadow: "0 4px 20px rgba(239,68,68,0.45)",
            transition: "transform 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          >📵</button>
          <div style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>End call</div>
        </div>

        <div style={{ width: 36, height: 1, background: "rgba(255,255,255,0.08)" }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button
            title="Pop out call into a separate window"
            onClick={() => {
              const agents = callAgents.map((a: any) => a.id).join(",");
              window.open(`/call-window.html?agents=${encodeURIComponent(agents)}`, "c2-call", "width=520,height=780,resizable=yes,scrollbars=yes");
            }}
            style={{
              width: 60, height: 60, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "2px solid rgba(255,255,255,0.18)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, transition: "all 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          >⤢</button>
          <div style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Pop out</div>
        </div>
      </div>

      {/* ── Subtitle bar — pinned to bottom ── */}
      <div style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10,
        width: "min(760px, calc(100% - 132px))",
        pointerEvents: "none",
        display: "flex", flexDirection: "column", gap: 6,
        alignItems: "center",
      }}>
        {/* Live text captions */}
        {liveText && (
          <div style={{
            width: "min(640px, 100%)",
            textAlign: "center",
            fontSize: 15,
            color: "rgba(236,240,245,0.88)",
            fontStyle: "normal",
            letterSpacing: "0.01em",
            lineHeight: 1.55,
            padding: "8px 14px",
            borderRadius: 16,
            background: "rgba(8,12,18,0.34)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 10px 26px rgba(0,0,0,0.16)",
            backdropFilter: "blur(6px)",
            pointerEvents: "none",
          }}>
            {liveText}
          </div>
        )}

        {/* Fading message history — newest at bottom, older lines fade after halfway up */}
        {callMessages.length > 0 && (() => {
          return (
            <div ref={callMsgEndRef} style={{
              width: "100%", maxWidth: 680,
              display: "flex", flexDirection: "column", gap: 2,
              maxHeight: 176,
              overflowY: "auto",
              padding: "0 4px 2px 4px",
              pointerEvents: "auto",
              maskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 52%, rgba(0,0,0,0.5) 78%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 52%, rgba(0,0,0,0.5) 78%, transparent 100%)",
            }}>
              {callMessages.map((msg, idx) => {
                const distFromEnd = callMessages.length - 1 - idx;
                const opacity = Math.max(0.18, 1 - distFromEnd * 0.11);
                return (
                  <div key={idx} style={{
                    opacity,
                    display: "flex",
                    justifyContent: msg.isUser ? "flex-end" : "flex-start",
                    padding: "2px 0",
                    transition: "opacity 0.3s",
                  }}>
                    <div style={{
                      maxWidth: "min(100%, 560px)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "7px 10px",
                      borderRadius: msg.isUser ? "16px 16px 8px 16px" : "16px 16px 16px 8px",
                      background: msg.isUser ? "rgba(78,20,20,0.22)" : "rgba(16,21,28,0.26)",
                      border: msg.isUser ? "1px solid rgba(239,68,68,0.12)" : "1px solid rgba(255,255,255,0.05)",
                      boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
                      backdropFilter: "blur(4px)",
                    }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: msg.isUser ? "rgba(255,255,255,0.44)" : "rgba(255,255,255,0.34)",
                      }}>{msg.isUser ? "TASK" : msg.from}</span>
                      <span style={{ fontSize: 12.5, color: "rgba(234,238,244,0.78)", lineHeight: 1.48 }}>{msg.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Text input */}
        <div style={{ width: "100%", maxWidth: 440, pointerEvents: "auto" }}>
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24, padding: "6px 10px 6px 16px",
        }}>
          {targetedAgentIds.map(tid => {
            const tc = agentColor(tid);
            const tname = callAgents.find(a => a.id.toLowerCase() === tid)?.name || tid;
            return (
              <span key={tid} style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                color: tc, background: `${tc}18`, border: `1px solid ${tc}40`,
                borderRadius: 10, padding: "2px 8px", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                {tname.toUpperCase()}
                <span
                  style={{ cursor: "pointer", opacity: 0.6, lineHeight: 1 }}
                  onClick={() => {
                    const next = targetedAgentIds.filter(id => id !== tid);
                    setTargetedAgentIds(next);
                    targetedAgentRef.current = next;
                  }}
                >×</span>
              </span>
            );
          })}
          <input
            ref={callInputRef}
            value={callInput}
            onChange={e => setCallInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const t = callInput.trim();
                if (!t) return;
                setCallInput("");
                setCallMessages(prev => [...prev, { from: "You", text: t, isUser: true }]);
                const targets = targetedAgentRef.current.length > 0
                  ? callAgents.filter(a => targetedAgentRef.current.includes(a.id.toLowerCase()))
                  : callAgents;
                onUserMessage?.(t, targets);
                isFetchingRef.current = true;
                ttsAbortRef.current = false;
                (async () => {
                  for (const ag of targets) {
                    if (ttsAbortRef.current || endedRef.current) break;
                    await fireToAgent(t, ag);
                  }
                  isFetchingRef.current = false;
                  ttsAbortRef.current = false;
                })();
              }
            }}
            placeholder={targetedAgentIds.length > 0 ? `Private to ${targetedAgentIds.map(id => callAgents.find(a=>a.id.toLowerCase()===id)?.name||id).join(", ")}…` : "Type a message…"}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "rgba(255,255,255,0.8)", fontSize: 13,
              caretColor: "rgba(255,255,255,0.6)",
            }}
          />
          <button
            onClick={() => {
              const t = callInput.trim();
              if (!t) return;
              setCallInput("");
              setCallMessages(prev => [...prev, { from: "You", text: t, isUser: true }]);
              const targets = targetedAgentRef.current.length > 0
                ? callAgents.filter(a => targetedAgentRef.current.includes(a.id.toLowerCase()))
                : callAgents;
              onUserMessage?.(t, targets);
              isFetchingRef.current = true;
              ttsAbortRef.current = false;
              (async () => {
                for (const ag of targets) {
                  if (ttsAbortRef.current || endedRef.current) break;
                  await fireToAgent(t, ag);
                }
                isFetchingRef.current = false;
                ttsAbortRef.current = false;
              })();
            }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.45)", fontSize: 18, padding: "0 4px",
              flexShrink: 0, lineHeight: 1,
            }}
          >↑</button>
        </div>
        </div>{/* /input wrapper */}
      </div>{/* /subtitle bar */}
    </div>
  );
}

/* ─── New Group Modal ─── */

function NewGroupModal({
  agentIds, agentMap, onClose, onCreate,
}: {
  agentIds: string[];
  agentMap: Record<string, any>;
  onClose: () => void;
  onCreate: (name: string, ids: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border-strong)",
        borderRadius: 16, padding: 28, minWidth: 360, maxWidth: 440,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>New Group Chat</div>

        <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 6, display: "block" }}>GROUP NAME</label>
        <input
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 10,
            background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-1)",
            fontSize: 13, marginBottom: 20,
          }}
          placeholder="e.g. Build Team, All Hands…"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 8, display: "block" }}>SELECT AGENTS</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {agentIds.map(id => {
            const ag = agentMap[id];
            const color = agentColor(id);
            const isOn = selected.includes(id);
            return (
              <button key={id} onClick={() => toggle(id)} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                background: isOn ? `${color}1a` : "var(--surface-raised)",
                outline: isOn ? `1.5px solid ${color}55` : "1.5px solid transparent",
                transition: "all 0.15s",
              }}>
                <AgentAvatar agentId={id} name={ag?.name || id} size={30} />
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)" }}>{ag?.name || id}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)" }}>{ag?.role || ""}</div>
                </div>
                {isOn && <span style={{ color, fontSize: 18 }}>✓</span>}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "8px 18px", borderRadius: 8, background: "var(--surface-raised)",
            border: "1px solid var(--border)", color: "var(--text-1)", cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button
            onClick={() => { if (name.trim() && selected.length > 0) onCreate(name.trim(), selected); }}
            disabled={!name.trim() || selected.length === 0}
            style={{
              padding: "8px 18px", borderRadius: 8, background: "var(--accent)",
              border: "none", color: "#fff", cursor: selected.length > 0 && name.trim() ? "pointer" : "default",
              fontSize: 13, opacity: (!name.trim() || selected.length === 0) ? 0.5 : 1,
            }}>Create Group</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Broadcast Modal ─── */

function BroadcastModal({
  agentIds, agentMap, onClose, onSend,
}: {
  agentIds: string[];
  agentMap: Record<string, any>;
  onClose: () => void;
  onSend: (text: string, ids: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>(agentIds);

  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border-strong)",
        borderRadius: 16, padding: 28, minWidth: 380, maxWidth: 460,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📢 Broadcast</div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 20 }}>
          Send the same message to multiple agents at once
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {agentIds.map(id => {
            const ag = agentMap[id];
            const color = agentColor(id);
            const on = selected.includes(id);
            return (
              <button key={id} onClick={() => toggle(id)} style={{
                padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer",
                background: on ? `${color}22` : "var(--surface-raised)",
                outline: on ? `1.5px solid ${color}` : "1.5px solid var(--border)",
                color: on ? color : "var(--text-2)",
                fontSize: 12, fontWeight: 600, transition: "all 0.15s",
              }}>{ag?.name || id}</button>
            );
          })}
        </div>

        <textarea
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10,
            background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-1)",
            fontSize: 13, resize: "none", minHeight: 100,
          }}
          placeholder="Type your broadcast message…"
          value={text}
          onChange={e => setText(e.target.value)}
          autoFocus
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: "8px 18px", borderRadius: 8, background: "var(--surface-raised)",
            border: "1px solid var(--border)", color: "var(--text-1)", cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button
            onClick={() => { if (text.trim() && selected.length > 0) onSend(text.trim(), selected); }}
            disabled={!text.trim() || selected.length === 0}
            style={{
              padding: "8px 18px", borderRadius: 8, background: "var(--accent)",
              border: "none", color: "#fff", cursor: "pointer", fontSize: 13,
              opacity: (!text.trim() || selected.length === 0) ? 0.5 : 1,
            }}>📢 Send to {selected.length} agents</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Conv Dropdown (glass, agent avatars) ─── */

function ConvDropdown({
  conversations, activeConvId, onSelect, agentMap,
  triggerStyle,
}: {
  conversations: Conversation[];
  activeConvId: string | null;
  onSelect: (id: string) => void;
  agentMap: Record<string, any>;
  triggerStyle?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const sorted = [...conversations].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.lastUpdated.localeCompare(a.lastUpdated)
  );
  const active = conversations.find(c => c.id === activeConvId);

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0, ...triggerStyle }}>
      <button
        onClick={() => setOpen(s => !s)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: "none", cursor: "pointer",
          padding: "4px 6px 4px 0", width: "100%", minWidth: 0,
          color: "var(--text-1)",
        }}
      >
        {active && (active.type === "dm"
          ? <AgentAvatar agentId={active.agentIds[0]} name={active.agentIds[0]} size={26} />
          : <GroupAvatar agentIds={active.agentIds} agentMap={agentMap} size={26} />)}
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active ? convDisplayName(active, agentMap) : "Select…"}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: "var(--text-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }}>
          <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 500,
          background: "rgba(6,10,20,0.88)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 14, padding: 6,
          minWidth: 220, maxWidth: 320,
          boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)",
        }}>
          {sorted.map(conv => {
            const isActive = conv.id === activeConvId;
            const pid = conv.agentIds[0];
            const color = agentColor(pid);
            return (
              <button
                key={conv.id}
                onClick={() => { onSelect(conv.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "7px 10px", borderRadius: 9,
                  border: "none", cursor: "pointer", fontSize: 13,
                  color: "var(--text-1)", textAlign: "left",
                  background: isActive ? `${color}18` : "transparent",
                  transition: "background .1s",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? `${color}18` : "transparent"; }}
              >
                {conv.type === "dm"
                  ? <AgentAvatar agentId={pid} name={pid} size={28} />
                  : <GroupAvatar agentIds={conv.agentIds} agentMap={agentMap} size={28} />}
                <span style={{ flex: 1, fontWeight: isActive ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {convDisplayName(conv, agentMap)}
                </span>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2 6.5l3 3 5-5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main Messages Page ─── */

export function MessagesPage({ data }: PageProps) {
  const rawAgents: any[] = data?.voice?.agents || data?.agents || [];
  const agents: any[] = [...rawAgents].sort((a, b) => {
    const ai = AGENT_ORDER.indexOf(a.id.toLowerCase());
    const bi = AGENT_ORDER.indexOf(b.id.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const agentMap: Record<string, any> = {};
  agents.forEach(a => { agentMap[a.id] = a; });
  const agentIds = agents.map(a => a.id);

  function seedConversations(): Conversation[] {
    return agents.map(a => ({
      id: `dm-${a.id}`,
      type: "dm" as ConvType,
      agentIds: [a.id],
      name: a.name,
      pinned: false,
      lastUpdated: new Date().toISOString(),
      messages: [],
    }));
  }

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const stored = loadConversationsLocal();
    return stored.length > 0 ? stored : seedConversations();
  });

  const [activeConvId, setActiveConvId] = useState<string | null>(
    conversations.length > 0 ? conversations[0].id : null
  );
  const [inputText, setInputText] = useState("");
  const [selectionQuote, setSelectionQuote] = useState<{ text: string; x: number; y: number } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callAgents, setCallAgents] = useState<any[]>([]);
  const callAgentsRef = useRef<any[]>([]);
  const callActiveRef = useRef(false);
  const [callInitialMessage, setCallInitialMessage] = useState<{ text: string; agentId: string } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ agentId: string; agentName: string; message: string; withAgents?: string[]; urgent?: boolean } | null>(null);
  const [inlineCallQueue, setInlineCallQueue] = useState<Array<{ agentId: string; agentName: string; message: string; withAgents?: string[]; urgent?: boolean }>>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Track last server-known updatedAt to detect remote changes
  const serverUpdatedAtRef = useRef<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Keep refs in sync for SSE handler (closure captures refs, not state)
  useEffect(() => { callActiveRef.current = callActive; }, [callActive]);
  useEffect(() => { callAgentsRef.current = callAgents; }, [callAgents]);

  const activeConv = conversations.find(c => c.id === activeConvId) || null;

  // On mount: load from server (overrides localStorage if server has data)
  useEffect(() => {
    loadConversationsFromServer().then(result => {
      if (!result) return;
      serverUpdatedAtRef.current = result.updatedAt;
      if (result.conversations.length > 0) {
        setConversations(result.conversations);
        saveConversationsLocal(result.conversations);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to server + localStorage whenever conversations change
  useEffect(() => {
    saveConversationsLocal(conversations);
    saveConversationsToServer(conversations).then(() => {
      serverUpdatedAtRef.current = new Date().toISOString();
    });
  }, [conversations]);

  // Poll server every 15s — pick up changes made on the other instance
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await loadConversationsFromServer();
      if (!result?.updatedAt) return;
      if (result.updatedAt === serverUpdatedAtRef.current) return;
      // Server has newer data — merge: add any messages we don't have locally
      serverUpdatedAtRef.current = result.updatedAt;
      setConversations(local => {
        const merged = result.conversations.map(remote => {
          const loc = local.find(c => c.id === remote.id);
          if (!loc) return remote;
          // Merge messages: union by id, sorted by ts
          const msgMap = new Map<string, ChatMessage>();
          [...loc.messages, ...remote.messages].forEach(m => msgMap.set(m.id, m));
          const msgs = [...msgMap.values()].sort((a, b) => a.ts.localeCompare(b.ts));
          return { ...remote, messages: msgs };
        });
        // Add any local-only conversations not on server
        local.forEach(loc => {
          if (!merged.find(c => c.id === loc.id)) merged.push(loc);
        });
        return merged;
      });
    }, 15_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages.length]);

  // ESC = exit fullscreen / close add-agent popover; Ctrl+F = enter fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAddAgent) { setShowAddAgent(false); return; }
        setIsFullscreen(false);
      }
      if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsFullscreen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddAgent]);

  // Close add-agent popover on outside click
  useEffect(() => {
    if (!showAddAgent) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.("[data-add-agent-popup]")) setShowAddAgent(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAddAgent]);

  // Focus input when switching conversations
  useEffect(() => { inputRef.current?.focus(); }, [activeConvId]);

  // Show "Ask" bubble when user highlights text inside the message thread
  useEffect(() => {
    const onUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!text || !threadRef.current) { setSelectionQuote(null); return; }
      // Only react if the selection is inside the thread
      const range = sel!.getRangeAt(0);
      const node = range.commonAncestorContainer;
      if (!threadRef.current.contains(node instanceof Element ? node : node.parentElement)) {
        setSelectionQuote(null); return;
      }
      const rect = range.getBoundingClientRect();
      setSelectionQuote({ text, x: rect.left + rect.width / 2, y: rect.top - 8 });
    };
    const onDown = (e: MouseEvent) => {
      // Clear if clicking outside the bubble
      if (!(e.target as Element)?.closest?.("[data-ask-bubble]")) setSelectionQuote(null);
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("mouseup", onUp); document.removeEventListener("mousedown", onDown); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for agent-initiated calls via SSE — auto-reconnects with backoff
  useEffect(() => {
    let es: EventSource | null = null;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let dead = false;

    function connect() {
      if (dead) return;
      es = new EventSource("/api/mission-control/events/stream");
      es.onmessage = (e) => {
        retryDelay = 1000; // reset backoff on successful message
        try {
          const ev = JSON.parse(e.data);
          if (ev.type === "agent_incoming_call") {
            const withAgents = Array.isArray(ev.withAgents) ? ev.withAgents : [];
            const urgent = typeof ev.urgent === "boolean" ? ev.urgent : inferUrgentCall(String(ev.message || ""));
            if (callActiveRef.current) {
              const inCallIds = callAgentsRef.current.map((a: any) => a.id.toLowerCase());
              if (inCallIds.includes(ev.agentId.toLowerCase())) {
                addAgentsToCall(withAgents);
                setInlineCallQueue(q => {
                  const existing = q.find(item => item.agentId.toLowerCase() === String(ev.agentId).toLowerCase());
                  if (existing) {
                    return q.map(item =>
                      item.agentId.toLowerCase() === String(ev.agentId).toLowerCase()
                        ? { ...item, message: ev.message, urgent: item.urgent || urgent, withAgents }
                        : item
                    );
                  }
                  return [...q, { agentId: ev.agentId, agentName: ev.agentName, message: ev.message, withAgents, urgent }];
                });
                return;
              }
              const callerGroup = [ev.agentId, ...withAgents];
              addAgentsToCall(callerGroup);
              setInlineCallQueue(q => {
                const existing = q.find(item => item.agentId.toLowerCase() === String(ev.agentId).toLowerCase());
                if (existing) {
                  return q.map(item =>
                    item.agentId.toLowerCase() === String(ev.agentId).toLowerCase()
                      ? { ...item, message: ev.message, urgent: item.urgent || urgent, withAgents }
                      : item
                  );
                }
                return [...q, { agentId: ev.agentId, agentName: ev.agentName, message: ev.message, withAgents, urgent }];
              });
              return;
            }
            setIncomingCall({ agentId: ev.agentId, agentName: ev.agentName, message: ev.message, withAgents, urgent });
          }
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => {
        es?.close();
        if (!dead) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30000);
            connect();
          }, retryDelay);
        }
      };
    }

    connect();
    return () => {
      dead = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile viewport state
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [agentMap]);

  useEffect(() => {
    if (!isMobile) {
      setMobilePane("thread");
      return;
    }
    if (!activeConvId) {
      setMobilePane("list");
    }
  }, [isMobile, activeConvId]);

  const updateConv = (id: string, updater: (c: Conversation) => Conversation) => {
    setConversations(prev => {
      const next = prev.map(c => c.id === id ? updater(c) : c);
      return next;
    });
  };

  /* Send a message to one agent in the active conversation */
  const sendMessage = async (text: string, convId: string, targetAgentId: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      role: "user", text: text.trim(), ts: new Date().toISOString(), reactions: [],
    };
    updateConv(convId, c => ({
      ...c,
      messages: [...c.messages, userMsg],
      lastUpdated: userMsg.ts,
    }));

    const addErrorBubble = (errText: string, retryText: string, retryAgentId: string) => {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "agent", agentId: retryAgentId,
        agentName: agentMap[retryAgentId]?.name || retryAgentId,
        text: `⚠️ ${errText} — tap to retry`,
        ts: new Date().toISOString(), reactions: [],
        voiceNote: false,
      } as any;
      updateConv(convId, c => ({ ...c, messages: [...c.messages, errMsg] }));
      // Clicking the error bubble retries
      setTimeout(() => {
        const bubble = document.getElementById(`msg-${errMsg.id}`);
        if (bubble) {
          bubble.style.cursor = "pointer";
          bubble.onclick = () => {
            updateConv(convId, c => ({ ...c, messages: c.messages.filter(m => m.id !== errMsg.id) }));
            void sendMessage(retryText, convId, retryAgentId);
          };
        }
      }, 100);
    };

    setSending(true);
    setStatusMsg("Thinking…");
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 45_000);
      let res: Response;
      try {
        res = await fetch("/api/voice/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: targetAgentId, message: text.trim() }),
          signal: controller.signal,
        });
      } finally { clearTimeout(to); }
      let json: any;
      try { json = await res.json(); } catch { json = {}; }
      const reply: string = (json.reply || json.text || "").trim();
      if (!reply) {
        setSending(false);
        setStatusMsg("");
        addErrorBubble(json.error || "No response", text, targetAgentId);
        return;
      }
      const ag = agentMap[targetAgentId];
      const agentMsg: ChatMessage = {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        role: "agent", agentId: targetAgentId, agentName: ag?.name || targetAgentId,
        text: reply, ts: new Date().toISOString(), reactions: [],
      };
      updateConv(convId, c => ({
        ...c,
        messages: [...c.messages, agentMsg],
        lastUpdated: agentMsg.ts,
      }));
      setSending(false);
      setStatusMsg("");
    } catch (err: any) {
      setSending(false);
      setStatusMsg("");
      const label = err?.name === "AbortError" ? "Timed out" : "Network error";
      addErrorBubble(label, text, targetAgentId);
    }
  };

  /* Send to active conversation (DM or group) */
  const handleSend = async () => {
    if (!activeConv || !inputText.trim() || sending) return;
    const text = inputText;
    setInputText("");
    if (activeConv.type === "dm") {
      await sendMessage(text, activeConv.id, activeConv.agentIds[0]);
    } else {
      // Group: send to all agents, collect replies
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`, role: "user", text: text.trim(),
        ts: new Date().toISOString(), reactions: [],
      };
      updateConv(activeConv.id, c => ({ ...c, messages: [...c.messages, userMsg], lastUpdated: userMsg.ts }));
      setSending(true);
      // Detect if user addressed specific agents ("Prime, ..." / "Hey Atlas and Dame, ...")
      const groupAgentObjects = activeConv.agentIds.map(id => agentMap[id] || { id, name: id });
      const addressedIds = detectAddressedAgents(text.trim(), groupAgentObjects);
      const targetIds = addressedIds ?? activeConv.agentIds;
      setStatusMsg(addressedIds ? `Sending to ${addressedIds.join(", ")}…` : "Sending to group…");
      await Promise.all(targetIds.map(async (aid) => {
        try {
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), 35_000);
          let res: Response;
          try {
            res = await fetch("/api/voice/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId: aid, message: text.trim() }),
              signal: controller.signal,
            });
          } finally { clearTimeout(to); }
          const json = await res.json();
          const reply: string = (json.reply || json.text || "").trim();
          if (!reply) {
            console.error(`[group send] ${aid} returned no reply:`, json.error || json);
            return;
          }
          const ag = agentMap[aid];
          const agentMsg: ChatMessage = {
            id: `a-${Date.now()}-${aid}`, role: "agent", agentId: aid, agentName: ag?.name || aid,
            text: reply, ts: new Date().toISOString(), reactions: [],
          };
          updateConv(activeConv.id, c => ({
            ...c, messages: [...c.messages, agentMsg], lastUpdated: agentMsg.ts,
          }));
        } catch { /* ignore per-agent errors */ }
      }));
      setSending(false);
      setStatusMsg("");
    }
  };

  const handleReact = (msgId: string, emoji: string) => {
    if (!activeConv) return;
    updateConv(activeConv.id, c => ({
      ...c,
      messages: c.messages.map(m => m.id === msgId ? {
        ...m,
        reactions: m.reactions.some(r => r.emoji === emoji && r.from === "user")
          ? m.reactions.filter(r => !(r.emoji === emoji && r.from === "user"))
          : [...m.reactions, { emoji, from: "user" }],
      } : m),
    }));
  };

  const handlePin = (convId: string) => {
    updateConv(convId, c => ({ ...c, pinned: !c.pinned }));
  };

  const createGroup = (name: string, ids: string[]) => {
    const newConv: Conversation = {
      id: `group-${Date.now()}`,
      type: "group",
      agentIds: ids,
      name,
      pinned: false,
      lastUpdated: new Date().toISOString(),
      messages: [],
    };
    setConversations(prev => [...prev, newConv]);
    setActiveConvId(newConv.id);
    if (isMobile) setMobilePane("thread");
    setShowNewGroup(false);
  };

  const addAgentToConv = (agentId: string) => {
    if (!activeConv) return;
    if (activeConv.agentIds.includes(agentId)) return; // already in
    if (activeConv.type === "dm") {
      // Upgrade DM → group
      const existingAgent = agentMap[activeConv.agentIds[0]];
      const newAgent = agentMap[agentId];
      const groupName = `${existingAgent?.name || activeConv.agentIds[0]} & ${newAgent?.name || agentId}`;
      updateConv(activeConv.id, c => ({
        ...c,
        type: "group",
        agentIds: [...c.agentIds, agentId],
        name: groupName,
      }));
    } else {
      updateConv(activeConv.id, c => ({
        ...c,
        agentIds: [...c.agentIds, agentId],
      }));
    }
    setShowAddAgent(false);
  };

  const addAgentToCall = (agentId: string) => {
    const ag = agentMap[agentId];
    if (!ag || callAgents.some(a => a.id === agentId)) return;
    setCallAgents(prev => [...prev, ag]);
  };

  const addAgentsToCall = (agentIdsToAdd: string[]) => {
    const normalized = agentIdsToAdd
      .map(id => String(id || "").toLowerCase())
      .filter(Boolean);
    if (!normalized.length) return;
    setCallAgents(prev => {
      const existing = new Set(prev.map(agent => String(agent.id || "").toLowerCase()));
      const additions = normalized
        .filter(id => !existing.has(id))
        .map(id => agentMap[id])
        .filter(Boolean);
      return additions.length ? [...prev, ...additions] : prev;
    });
  };

  const handleBroadcast = async (text: string, ids: string[]) => {
    setShowBroadcast(false);
    // Send to each agent's DM, or create a temporary broadcast conv
    const broadcastConv: Conversation = {
      id: `broadcast-${Date.now()}`,
      type: "group",
      agentIds: ids,
      name: `📢 Broadcast — ${new Date().toLocaleTimeString()}`,
      pinned: false,
      lastUpdated: new Date().toISOString(),
      messages: [],
    };
    setConversations(prev => [...prev, broadcastConv]);
    setActiveConvId(broadcastConv.id);
    if (isMobile) setMobilePane("thread");
    // slight delay so state settles
    await new Promise(r => setTimeout(r, 100));
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`, role: "user", text: text.trim(),
      ts: new Date().toISOString(), reactions: [],
    };
    setConversations(prev => prev.map(c => c.id === broadcastConv.id
      ? { ...c, messages: [...c.messages, userMsg], lastUpdated: userMsg.ts } : c));
    setSending(true);
    setStatusMsg(`Broadcasting to ${ids.length} agents…`);
    await Promise.all(ids.map(async (aid) => {
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 35_000);
        let res: Response;
        try {
          res = await fetch("/api/voice/chat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: aid, message: text.trim() }),
            signal: controller.signal,
          });
        } finally { clearTimeout(to); }
        const json = await res.json();
        const reply: string = (json.reply || json.text || "").trim();
        if (!reply) return;
        const ag = agentMap[aid];
        const agentMsg: ChatMessage = {
          id: `a-${Date.now()}-${aid}`, role: "agent", agentId: aid, agentName: ag?.name || aid,
          text: reply, ts: new Date().toISOString(), reactions: [],
        };
        setConversations(prev => prev.map(c => c.id === broadcastConv.id
          ? { ...c, messages: [...c.messages, agentMsg], lastUpdated: agentMsg.ts } : c));
      } catch { /* ignore */ }
    }));
    setSending(false);
    setStatusMsg("");
  };

  /* Called from CallOverlay when agent replies — add to conversation thread */
  const handleCallReply = (replyText: string, agentId: string, agentObj: any) => {
    if (!activeConvId) return;
    const agentMsg: ChatMessage = {
      id: `a-${Date.now()}-call`, role: "agent", agentId, agentName: agentObj?.name || agentId,
      text: replyText, ts: new Date().toISOString(), reactions: [],
    };
    updateConv(activeConvId, c => ({
      ...c, messages: [...c.messages, agentMsg], lastUpdated: agentMsg.ts,
    }));
  };

  const handleCallUserMessage = (text: string, _targets: any[]) => {
    if (!activeConvId) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}-call-${Math.random().toString(36).slice(2, 5)}`,
      role: "user",
      text: text.trim(),
      ts: new Date().toISOString(),
      reactions: [],
    };
    updateConv(activeConvId, c => ({
      ...c,
      messages: [...c.messages, userMsg],
      lastUpdated: userMsg.ts,
    }));
  };

  const startCall = (agentObjs: any[]) => {
    const primer = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(primer);
    window.speechSynthesis.cancel();
    setCallAgents(agentObjs);
    setCallActive(true);
  };

  const activeDmAgentId =
    activeConv?.type === "dm"
      ? activeConv.agentIds[0]
      : (activeConv?.agentIds?.[0] || agentIds[0] || "");

  const switchToAgent = (agentId: string) => {
    const existing = conversations.find(c => c.type === "dm" && c.agentIds[0] === agentId);
    if (existing) {
      setActiveConvId(existing.id);
      if (isMobile) setMobilePane("thread");
      return;
    }

    const ag = agentMap[agentId];
    const newConv: Conversation = {
      id: `dm-${agentId}`,
      type: "dm",
      agentIds: [agentId],
      name: ag?.name || agentId,
      pinned: false,
      lastUpdated: new Date().toISOString(),
      messages: [],
    };
    setConversations(prev => [...prev, newConv]);
    setActiveConvId(newConv.id);
    if (isMobile) setMobilePane("thread");
  };

  /* Sorted conversation list */
  const sortedConvs = [...conversations]
    .filter(c => {
      if (!sidebarSearch) return true;
      const q = sidebarSearch.toLowerCase();
      const dn = convDisplayName(c, agentMap).toLowerCase();
      return dn.includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });


  return (
    <div style={{
      display: "flex",
      height: isMobile ? "calc(100dvh - 88px)" : "calc(100vh - 120px)",
      gap: 0,
      overflow: "hidden",
      borderRadius: 12,
      border: "1px solid var(--border)",
      background: "var(--surface)",
    }}>

      {/* ── Left: Conversation List ── */}
      {(!isMobile || mobilePane === "list") && (
      <div style={{
        width: isMobile ? "100%" : 280,
        flexShrink: 0,
        borderRight: isMobile ? "none" : "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Messages</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button title="Broadcast to agents" onClick={() => setShowBroadcast(true)} style={{
                width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
                background: "var(--surface-raised)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              }}>📢</button>
              <button title="New group chat" onClick={() => setShowNewGroup(true)} style={{
                width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
                background: "var(--surface-raised)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              }}>👥</button>
            </div>
          </div>
          <input
            style={{
              width: "100%", padding: "7px 12px", borderRadius: 20,
              background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-1)",
              fontSize: isMobile ? 16 : 12,
            }}
            placeholder="Search conversations…"
            value={sidebarSearch}
            onChange={e => setSidebarSearch(e.target.value)}
          />
        </div>

        {/* Conversation items */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sortedConvs.map(conv => {
            const isActive = conv.id === activeConvId;
            const name = convDisplayName(conv, agentMap);
            const preview = convPreview(conv);
            const lastTs = conv.messages.length > 0 ? timeLabel(conv.lastUpdated) : "";
            const primaryId = conv.agentIds[0];
            const color = agentColor(primaryId);

            return (
              <div
                key={conv.id}
                onClick={() => {
                  setActiveConvId(conv.id);
                  if (isMobile) setMobilePane("thread");
                }}
                style={{
                  padding: "8px 12px",
                  background: isActive ? `${color}12` : "transparent",
                  borderLeft: isActive ? `3px solid ${color}` : "3px solid transparent",
                  cursor: "pointer",
                  display: "flex", gap: 10, alignItems: "center",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                {conv.type === "dm"
                  ? <AgentAvatar agentId={primaryId} name={name} size={32} />
                  : <GroupAvatar agentIds={conv.agentIds} agentMap={agentMap} size={32} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 4 }}>
                      {conv.pinned && <span style={{ fontSize: 10 }}>📌</span>}
                      {name}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>{lastTs}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                    {preview}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ── Right: Thread ── */}
      {(!isMobile || mobilePane === "thread") && (activeConv ? (
        <div style={isFullscreen ? {
          position: "fixed", inset: 0, zIndex: 500,
          background: "var(--surface)", display: "flex", flexDirection: "column",
        } : { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Thread header */}
          <div style={{
            padding: isMobile ? "8px 10px" : "8px 14px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 10, flexDirection: isMobile ? "column" : "row",
          }}>
            {isMobile && (
              <div style={{ width: "100%", display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  title="Back to conversations"
                  onClick={() => setMobilePane("list")}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
                    background: "var(--surface-raised)", color: "var(--text-1)", cursor: "pointer",
                    flexShrink: 0,
                  }}
                >←</button>
                <ConvDropdown
                  conversations={conversations}
                  activeConvId={activeConvId}
                  onSelect={(id) => { setActiveConvId(id); setMobilePane("thread"); }}
                  agentMap={agentMap}
                />
                <button
                  title="Create new group"
                  onClick={() => setShowNewGroup(true)}
                  style={{
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface-raised)",
                    color: "var(--text-1)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "0 10px",
                    flexShrink: 0,
                  }}
                >+ Group</button>
              </div>
            )}
            <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12 }}>
            {activeConv.type === "dm"
              ? <AgentAvatar agentId={activeConv.agentIds[0]} name={convDisplayName(activeConv, agentMap)} size={34} />
              : <GroupAvatar agentIds={activeConv.agentIds} agentMap={agentMap} size={34} />}
            <ConvDropdown
              conversations={conversations}
              activeConvId={activeConvId}
              onSelect={(id) => { setActiveConvId(id); if (isMobile) setMobilePane("thread"); }}
              agentMap={agentMap}
            />
            {statusMsg && (
              <span style={{ fontSize: 11, color: "var(--text-2)", fontStyle: "italic" }}>{statusMsg}</span>
            )}
            <div style={{ display: "flex", gap: 6, position: "relative" }}>
              {/* Add agent */}
              <button
                title="Add agent to conversation"
                onClick={() => setShowAddAgent(s => !s)}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                  background: showAddAgent ? "var(--surface-active)" : "var(--surface-raised)",
                  color: "var(--text-2)", cursor: "pointer", fontSize: 15, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >+</button>
              {showAddAgent && (
                <div data-add-agent-popup style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200,
                  background: "var(--surface)", border: "1px solid var(--border-strong)",
                  borderRadius: 12, padding: 8, minWidth: 180,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}>
                  <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, padding: "2px 8px 6px", letterSpacing: ".06em" }}>ADD TO CONVERSATION</div>
                  {agentIds.filter(id => !activeConv.agentIds.includes(id)).map(id => {
                    const ag = agentMap[id];
                    const color = agentColor(id);
                    return (
                      <button key={id} onClick={() => addAgentToConv(id)} style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: "transparent", color: "var(--text-1)", fontSize: 13,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-raised)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <AgentAvatar agentId={id} name={ag?.name || id} size={24} />
                        <span>{ag?.name || id}</span>
                      </button>
                    );
                  })}
                  {agentIds.every(id => activeConv.agentIds.includes(id)) && (
                    <div style={{ fontSize: 12, color: "var(--text-3)", padding: "6px 10px" }}>All agents already in conversation</div>
                  )}
                </div>
              )}
              {/* Pin */}
              <button title={activeConv.pinned ? "Unpin" : "Pin conversation"} onClick={() => handlePin(activeConv.id)} style={{
                padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-raised)",
                cursor: "pointer", fontSize: 12, color: activeConv.pinned ? "var(--yellow)" : "var(--text-2)",
              }}>{isMobile ? "📌" : activeConv.pinned ? "📌 Pinned" : "📌 Pin"}</button>
              {/* Call */}
              <button
                title={activeConv.type === "group" ? "Group voice call" : "Start live voice call"}
                onClick={() => {
                  const agObjs = activeConv.agentIds.map(id => agentMap[id]).filter(Boolean);
                  startCall(agObjs);
                }}
                style={{
                  padding: "5px 12px", borderRadius: 8, border: "none",
                  background: agentColor(activeConv.agentIds[0]),
                  color: "#000", cursor: "pointer", fontWeight: 700, fontSize: 12,
                }}
              >{isMobile ? "📞" : activeConv.type === "group" ? "📞 Group Call" : "📞 Call"}</button>
              {/* Fullscreen */}
              <button
                title={isFullscreen ? "Exit fullscreen" : "Expand chat fullscreen"}
                onClick={() => setIsFullscreen(f => !f)}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                  background: isFullscreen ? "var(--surface-active)" : "var(--surface-raised)",
                  color: "var(--text-2)", cursor: "pointer", fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >{isFullscreen ? "⊠" : "⛶"}</button>
            </div>
            </div>
          </div>

          {/* Messages thread */}
          <div ref={threadRef} style={{
            flex: 1, overflowY: "auto", padding: isMobile ? "8px" : "12px 16px",
            display: "flex", flexDirection: "column", gap: 10, position: "relative",
          }}>
            {activeConv.messages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13, marginTop: 60 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>
                  {activeConv.type === "dm" ? "💬" : "👥"}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {activeConv.type === "dm"
                    ? `Start a conversation with ${convDisplayName(activeConv, agentMap)}`
                    : `Welcome to ${activeConv.name}`}
                </div>
                <div style={{ fontSize: 12 }}>
                  {activeConv.type === "dm"
                    ? "Double-tap any message to react. Call for live voice."
                    : `${activeConv.agentIds.length} agents in this group`}
                </div>
              </div>
            )}
            {activeConv.messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} agentMap={agentMap} onReact={handleReact} />
            ))}
            <div ref={threadEndRef} />
          </div>

          {/* Floating "Ask" bubble on text selection */}
          {selectionQuote && (
            <div
              data-ask-bubble="1"
              onClick={() => {
                const quote = selectionQuote.text.length > 120
                  ? selectionQuote.text.slice(0, 120) + "…"
                  : selectionQuote.text;
                setInputText(`"${quote}" — `);
                setSelectionQuote(null);
                window.getSelection()?.removeAllRanges();
                setTimeout(() => {
                  const el = inputRef.current;
                  if (!el) return;
                  el.focus();
                  el.setSelectionRange(el.value.length, el.value.length);
                }, 0);
              }}
              style={{
                position: "fixed",
                left: selectionQuote.x,
                top: selectionQuote.y,
                transform: "translate(-50%, -100%)",
                zIndex: 9999,
                background: "rgba(30,30,40,0.88)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 20,
                padding: "5px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                userSelect: "none",
              }}
            >
              Ask about this
            </div>
          )}

          {/* Input bar */}
          <div style={{
            padding: isMobile ? "8px 10px" : "8px 14px", borderTop: "1px solid var(--border)",
            display: "flex", gap: 10, alignItems: "flex-end",
            position: isMobile ? "sticky" : "static",
            bottom: isMobile ? 0 : undefined,
            background: "var(--surface)",
            paddingBottom: isMobile ? "calc(10px + env(safe-area-inset-bottom))" : undefined,
            zIndex: isMobile ? 5 : "auto",
          }}>
                  <textarea
              ref={inputRef}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 20,
                background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-1)",
                fontSize: isMobile ? 16 : 13, resize: "none", lineHeight: 1.5, maxHeight: 120, overflowY: "auto",
                minHeight: isMobile ? 38 : 40,
              }}
              placeholder={`Message ${convDisplayName(activeConv, agentMap)}…`}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
              }}
              rows={1}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!inputText.trim() || sending}
              style={{
                width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                background: inputText.trim() && !sending ? "var(--accent)" : "var(--surface-raised)",
                color: inputText.trim() && !sending ? "#fff" : "var(--text-3)",
                fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s", flexShrink: 0,
              }}
            >{sending ? "…" : "↑"}</button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div style={{ fontWeight: 600 }}>Select a conversation</div>
          </div>
        </div>
      ))}

      {/* ── Incoming Call Modal ── */}
      {incomingCall && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 600,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
        }}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 24, padding: "32px 36px", textAlign: "center",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5)", maxWidth: 340, width: "90%",
          }}>
            {/* Pulsing avatar */}
            <div style={{ margin: "0 auto 20px", width: 72, height: 72, borderRadius: "50%",
              background: `${agentColor(incomingCall.agentId)}22`,
              border: `2px solid ${agentColor(incomingCall.agentId)}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "pulse 1.4s ease-in-out infinite",
              fontSize: 32,
            }}>
              {AGENT_EMOJI[incomingCall.agentId.toLowerCase()] || "📞"}
            </div>
            <style>{`@keyframes pulse { 0%,100%{box-shadow:0 0 0 0 ${agentColor(incomingCall.agentId)}44} 50%{box-shadow:0 0 0 14px transparent} }`}</style>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6 }}>Incoming call</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{incomingCall.agentName}</div>
            {incomingCall.urgent && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
                padding: "5px 10px",
                borderRadius: 999,
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.28)",
                color: "#fca5a5",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>Urgent</div>
            )}
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 28, lineHeight: 1.5 }}>{incomingCall.message}</div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button onClick={() => {
                const ag = agentMap[incomingCall.agentId] || { id: incomingCall.agentId, name: incomingCall.agentName };
                setCallInitialMessage({ text: incomingCall.message, agentId: incomingCall.agentId });
                setCallActive(true);
                const extras = (incomingCall.withAgents || [])
                  .map(id => agentMap[id])
                  .filter(Boolean);
                setCallAgents([ag, ...extras]);
                setIncomingCall(null);
              }} style={{
                minWidth: 220, padding: "12px 18px", borderRadius: 12, border: "none",
                background: agentColor(incomingCall.agentId),
                color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}>{incomingCall.withAgents?.length ? "Answer and join line" : "Answer"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Call Overlay ── */}
      {callActive && callAgents.length > 0 && (
        <CallOverlay
          callAgents={callAgents}
          agentMap={agentMap}
          onHangUp={() => { setCallActive(false); setCallAgents([]); setCallInitialMessage(null); setInlineCallQueue([]); window.speechSynthesis.cancel(); }}
          onMessage={handleCallReply}
          onUserMessage={handleCallUserMessage}
          initialMessage={callInitialMessage?.text}
          initialAgentId={callInitialMessage?.agentId}
          onAddAgent={addAgentToCall}
          allAgentIds={agentIds}
          inlineCallQueue={inlineCallQueue}
          dismissInlineCall={(id) => setInlineCallQueue(q => q.filter(x => x.agentId !== id))}
        />
      )}

      {/* ── Modals ── */}
      {showNewGroup && (
        <NewGroupModal
          agentIds={agentIds}
          agentMap={agentMap}
          onClose={() => setShowNewGroup(false)}
          onCreate={createGroup}
        />
      )}
      {showBroadcast && (
        <BroadcastModal
          agentIds={agentIds}
          agentMap={agentMap}
          onClose={() => setShowBroadcast(false)}
          onSend={handleBroadcast}
        />
      )}
    </div>
  );
}
