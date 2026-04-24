import { useState, useEffect } from "react";
import { Btn, StatusBadge, TagRow } from "./shell";
import { cn, formatRelative, dotTone, type PageProps } from "./types";

/* ─── Content ─── */

export function ContentPage({ data, context, focus }: PageProps) {
  const [query, setQuery] = useState("");
  const docs = data.docs?.items || [];
  const filtered = query.trim()
    ? docs.filter((d: any) => `${d.title} ${d.category} ${d.owner}`.toLowerCase().includes(query.toLowerCase()))
    : docs;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input className="field field-sm" style={{ width: 280 }} placeholder="Search content…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {filtered.map((doc: any) => (
          <button
            key={doc.id}
            className="list-item"
            onClick={() => focus("doc", doc)}
          >
            <div className="list-item-content">
              <div className="list-item-title">{doc.title}</div>
              <div className="list-item-sub">{doc.category} · {doc.owner}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="text-xs text-3">{formatRelative(doc.updatedAt)}</span>
              <StatusBadge value={doc.status} />
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="empty"><span className="empty-text">No content found</span></div>}
      </div>
    </div>
  );
}

/* ─── Docs (Google Drive Browser) ─── */

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
}
interface Crumb { id: string; name: string; }

function driveIcon(mime: string): string {
  if (mime === "application/vnd.google-apps.folder") return "📁";
  if (mime === "application/vnd.google-apps.document") return "📄";
  if (mime === "application/vnd.google-apps.spreadsheet") return "📊";
  if (mime === "application/vnd.google-apps.presentation") return "📽";
  if (mime === "application/vnd.google-apps.form") return "📋";
  if (mime.startsWith("image/")) return "🖼";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.includes("pdf")) return "📋";
  return "📄";
}

function fmtSize(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

export function DocsPage(_props: PageProps) {
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([{ id: "root", name: "My Drive" }]);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Debounce search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch files when folder or search changes
  useEffect(() => {
    const parent = breadcrumb[breadcrumb.length - 1].id;
    setFilesLoading(true);
    fetch(`/api/drive/files?parent=${encodeURIComponent(parent)}&q=${encodeURIComponent(debouncedQ)}`)
      .then(r => r.json())
      .then((d: any) => setFiles(d.files || []))
      .catch(() => setFiles([]))
      .finally(() => setFilesLoading(false));
  }, [breadcrumb, debouncedQ]);

  function handleFileClick(f: DriveFile) {
    if (f.mimeType === "application/vnd.google-apps.folder") {
      setBreadcrumb(prev => [...prev, { id: f.id, name: f.name }]);
      setQuery("");
      setDebouncedQ("");
      setSelected(null);
    } else {
      setSelected(f);
      if (f.mimeType === "application/vnd.google-apps.document") {
        setContentLoading(true);
        setEditDraft("");
        fetch(`/api/drive/docs/${f.id}`)
          .then(r => r.json())
          .then((d: any) => setEditDraft(d.content || ""))
          .catch(() => setEditDraft(""))
          .finally(() => setContentLoading(false));
      }
    }
  }

  function navigateTo(crumb: Crumb, idx: number) {
    setBreadcrumb(prev => prev.slice(0, idx + 1));
    setSelected(null);
  }

  async function saveDoc() {
    if (!selected) return;
    setSaving(true);
    setSaveMsg("");
    try {
      await fetch(`/api/drive/docs/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editDraft })
      });
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {
      setSaveMsg("Save failed");
    } finally {
      setSaving(false);
    }
  }

  const isDoc = selected?.mimeType === "application/vnd.google-apps.document";

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left panel */}
      <div style={{ width: 280, minWidth: 280, borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #2a2a2a" }}>
          <input
            className="field field-sm"
            placeholder="Search Drive…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ padding: "5px 12px", fontSize: 11, color: "#666", display: "flex", flexWrap: "wrap", gap: 2, borderBottom: "1px solid #1e1e1e" }}>
          {breadcrumb.map((c, i) => (
            <span
              key={c.id}
              style={{ cursor: i < breadcrumb.length - 1 ? "pointer" : "default", color: i === breadcrumb.length - 1 ? "#ccc" : "#555" }}
              onClick={() => i < breadcrumb.length - 1 && navigateTo(c, i)}
            >
              {c.name}{i < breadcrumb.length - 1 ? " /" : ""}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filesLoading ? (
            <div className="empty"><span className="empty-text">Loading…</span></div>
          ) : files.length === 0 ? (
            <div className="empty"><span className="empty-text">No files</span></div>
          ) : files.map(f => (
            <div
              key={f.id}
              className={cn("list-item", selected?.id === f.id && "list-item-active")}
              onClick={() => handleFileClick(f)}
              style={{ cursor: "pointer" }}
            >
              <span style={{ marginRight: 6, fontSize: 14 }}>{driveIcon(f.mimeType)}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{f.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16, overflow: "hidden" }}>
        {!selected ? (
          <div className="empty"><span className="empty-text">Select a file</span></div>
        ) : isDoc ? (
          <>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{selected.name}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith("Save f") ? "#f87171" : "#4ade80" }}>{saveMsg}</span>}
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveDoc}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            {contentLoading ? (
              <div className="empty"><span className="empty-text">Loading…</span></div>
            ) : (
              <textarea
                className="field field-area"
                style={{ flex: 1, resize: "none", fontFamily: "monospace", fontSize: 13, minHeight: 0 }}
                value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
              />
            )}
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{selected.name}</div>
            <div style={{ fontSize: 12, color: "#888", lineHeight: 1.9 }}>
              <div>Type: {selected.mimeType}</div>
              {selected.size && <div>Size: {fmtSize(Number(selected.size))}</div>}
              <div>Modified: {new Date(selected.modifiedTime).toLocaleString()}</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <a
                className="btn btn-secondary btn-sm"
                href={`https://drive.google.com/file/d/${selected.id}/view`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Drive ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Memories ─── */

// Map raw Claude project folder IDs → human labels + categories
const PROJECT_MAP: Record<string, { label: string; category: string; description: string }> = {
  "C--Users-offic": {
    label: "Command Center",
    category: "C2 System",
    description: "C2 dashboard, agent control, MCP, claude-mem",
  },
  "C--Users-offic--claude-mem-observer-sessions": {
    label: "Claude Mem Observer",
    category: "Memory System",
    description: "Memory observer sessions, transcript watch",
  },
  "c--Users-offic-Documents-Codex-data-te-crm-acquisition-engine": {
    label: "CRM Acquisition Engine",
    category: "Task Enterprise",
    description: "IG-to-CRM lead engine, automation pipeline",
  },
  "c--Users-offic-Downloads-2": {
    label: "Downloads (2)",
    category: "Misc",
    description: "Misc sessions from Downloads folder",
  },
  "c--Users-offic-Downloads-a": {
    label: "Downloads (A)",
    category: "Misc",
    description: "Misc sessions from Downloads folder",
  },
  "c--Users-offic-Sync": {
    label: "Sync / MCP Server",
    category: "Infrastructure",
    description: "MCP server, OpenClaw, multi-agent infra, C2 builds",
  },
};

// Your 7 core projects for the top-level category view
const CORE_PROJECTS = [
  { id: "task-enterprise",   label: "Task Enterprise",      icon: "🏢", folderIds: ["c--Users-offic-Documents-Codex-data-te-crm-acquisition-engine"] },
  { id: "c2",                label: "C2",                   icon: "🖥", folderIds: ["C--Users-offic", "c--Users-offic-Sync"] },
  { id: "agents",            label: "Agent Ecosystem",      icon: "🤖", folderIds: ["C--Users-offic"] },
  { id: "mcp",               label: "MCP System",           icon: "⚙️", folderIds: ["c--Users-offic-Sync", "C--Users-offic--claude-mem-observer-sessions"] },
  { id: "openclaw",          label: "OpenClaw Infra",       icon: "🔗", folderIds: ["c--Users-offic-Sync"] },
  { id: "memory",            label: "Memory System",        icon: "🧠", folderIds: ["C--Users-offic--claude-mem-observer-sessions", "C--Users-offic"] },
  { id: "misc",              label: "Other",                icon: "📁", folderIds: ["c--Users-offic-Downloads-2", "c--Users-offic-Downloads-a"] },
];

function resolveProjectLabel(folderId: string): string {
  return PROJECT_MAP[folderId]?.label || folderId;
}

function fmtDate(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

const TOPIC_COLOR_STYLES: Record<string, { bg: string; text: string }> = {
  red:    { bg: "rgba(224,53,53,0.18)",    text: "#ff9c9c" },
  blue:   { bg: "rgba(59,130,246,0.18)",   text: "#93c5fd" },
  green:  { bg: "rgba(34,197,94,0.18)",    text: "#86efac" },
  purple: { bg: "rgba(168,85,247,0.18)",   text: "#d8b4fe" },
  amber:  { bg: "rgba(245,158,11,0.18)",   text: "#fcd34d" },
  teal:   { bg: "rgba(20,184,166,0.18)",   text: "#5eead4" },
  rose:   { bg: "rgba(244,63,94,0.18)",    text: "#fda4af" },
  indigo: { bg: "rgba(99,102,241,0.18)",   text: "#a5b4fc" },
};

interface IndexEntry {
  title: string;
  primaryTopic: string;
  topics: string[];
  project: string;
  indexedAt: string | null;
  fileSize: number;
}
interface ConvIndex {
  topicColors: Record<string, string>;
  sessions: Record<string, IndexEntry>;
}
interface IndexStatus { indexed: number; pending: number; analyzing: number; }

function TopicTags({ sessionId, topics, topicColors, expanded, onToggle }: {
  sessionId: string;
  topics: string[];
  topicColors: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (topics.length === 0) return null;
  const primary = topics[0];
  const rest = topics.slice(1);
  const primaryColor = TOPIC_COLOR_STYLES[topicColors[primary]] || TOPIC_COLOR_STYLES["red"];

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
      <span style={{
        fontSize: 9, padding: "2px 7px", borderRadius: 4,
        background: primaryColor.bg, color: primaryColor.text,
        fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
      }}>
        {primary}
      </span>
      {rest.length > 0 && !expanded && (
        <span
          onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{
            fontSize: 9, padding: "2px 7px", borderRadius: 4,
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)",
            fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          +{rest.length} more
        </span>
      )}
      {expanded && rest.map(topic => {
        const c = TOPIC_COLOR_STYLES[topicColors[topic]] || TOPIC_COLOR_STYLES["purple"];
        return (
          <span key={topic} style={{
            fontSize: 9, padding: "2px 7px", borderRadius: 4,
            background: c.bg, color: c.text,
            fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
          }}>
            {topic}
          </span>
        );
      })}
    </div>
  );
}

export function MemoriesPage(_props: PageProps) {
  const [folders, setFolders] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [convIndex, setConvIndex] = useState<ConvIndex>({ topicColors: {}, sessions: {} });
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ indexed: 0, pending: 0, analyzing: 0 });
  const [expandedTopics, setExpandedTopics] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/conversations/projects").then(r => r.json()).then(d => setFolders(d.projects || [])).catch(() => {});
    fetch("/api/claude-mem/api/stats").then(r => r.json()).then(d => setStats(d)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/conversations/index")
      .then(r => r.json())
      .then((d: ConvIndex) => setConvIndex(d))
      .catch(() => {});

    fetch("/api/conversations/index/status")
      .then(r => r.json())
      .then((d: IndexStatus) => setIndexStatus(d))
      .catch(() => {});

    const es = new EventSource("/api/conversations/index/stream");
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "connected") {
          setIndexStatus(msg.status);
        } else if (msg.type === "indexed" && msg.sessionId && msg.data) {
          setConvIndex(prev => ({
            ...prev,
            sessions: { ...prev.sessions, [msg.sessionId]: msg.data },
          }));
          setIndexStatus(prev => ({
            indexed: prev.indexed + 1,
            pending: Math.max(0, prev.pending - 1),
            analyzing: Math.max(0, prev.analyzing - 1),
          }));
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    setLoadingSessions(true);
    const url = selectedFolder === "all"
      ? "/api/conversations/sessions"
      : `/api/conversations/sessions?project=${encodeURIComponent(selectedFolder)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, [selectedFolder]);

  async function openSession(s: any) {
    if (selectedSession?.file === s.file) return;
    setSelectedSession(s);
    setMessages([]);
    setLoadingMsgs(true);
    try {
      const r = await fetch(`/api/conversations/messages?file=${encodeURIComponent(s.file)}`);
      const d = await r.json();
      setMessages(d.messages || []);
    } catch { setMessages([]); }
    setLoadingMsgs(false);
  }

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? sessions.filter(s =>
        `${s.title || ""} ${s.firstPrompt || ""} ${s.cwd || ""}`.toLowerCase().includes(q)
        || (convIndex.sessions[s.sessionId]?.title || "").toLowerCase().includes(q)
        || (convIndex.sessions[s.sessionId]?.primaryTopic || "").toLowerCase().includes(q)
        || (convIndex.sessions[s.sessionId]?.topics || []).some((t: string) => t.toLowerCase().includes(q))
      )
    : sessions;
  const isSubagent = (s: any) => Boolean(s.file?.includes("/subagents/"));
  const mainSessions = filtered.filter(s => !isSubagent(s));
  const subSessions  = filtered.filter(s => isSubagent(s));
  const knownFolderIds = CORE_PROJECTS.flatMap(p => p.folderIds);
  const miscFolders = folders.filter(f => !knownFolderIds.includes(f.id));

  // Pill style matching home tab
  const pill = (active: boolean): React.CSSProperties => ({
    padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 700,
    border: active ? "1px solid rgba(224,53,53,0.6)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(224,53,53,0.18)" : "rgba(255,255,255,0.035)",
    color: active ? "#ff9c9c" : "rgba(255,255,255,0.45)",
    cursor: "pointer", whiteSpace: "nowrap" as const, transition: "all 0.15s",
    letterSpacing: "0.02em",
  });

  const metaTag: React.CSSProperties = {
    fontSize: 10, padding: "2px 8px", borderRadius: 6,
    background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)",
    fontFamily: "var(--font-mono)",
  };

  const renderSessionCard = (s: any) => {
    const active = selectedSession?.file === s.file;
    const proj = PROJECT_MAP[s.project];
    return (
      <button
        key={s.file}
        onClick={() => openSession(s)}
        style={{
          textAlign: "left", padding: "14px 16px", borderRadius: 12,
          background: active ? "linear-gradient(135deg, rgba(224,53,53,0.18), rgba(255,255,255,0.03))" : "rgba(255,255,255,0.03)",
          border: active ? "1px solid rgba(224,53,53,0.35)" : "1px solid rgba(255,255,255,0.06)",
          cursor: "pointer", transition: "all 0.15s",
          boxShadow: active ? "0 4px 20px rgba(224,53,53,0.15)" : "none",
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.055)"; e.currentTarget.style.borderColor = "rgba(224,53,53,0.2)"; } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; } }}
      >
        {(() => {
          const indexed = convIndex.sessions[s.sessionId];
          const title = indexed?.title || s.title || s.firstPrompt || "Untitled";
          const isAnalyzing = !indexed || indexed.indexedAt === null;
          return (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ececec", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                {isAnalyzing && !indexed ? (
                  <span style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic", fontWeight: 400 }}>Analyzing…</span>
                ) : title}
              </div>
              {indexed && indexed.topics.length > 0 && (
                <TopicTags
                  sessionId={s.sessionId}
                  topics={indexed.topics}
                  topicColors={convIndex.topicColors}
                  expanded={expandedTopics === s.sessionId}
                  onToggle={() => setExpandedTopics(prev => prev === s.sessionId ? null : s.sessionId)}
                />
              )}
            </>
          );
        })()}
        {s.firstPrompt && s.title && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>
            {s.firstPrompt.slice(0, 80)}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {proj && (
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(224,53,53,0.15)", color: "#ff9c9c", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {proj.category}
            </span>
          )}
          {s.ts && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{fmtDate(s.ts)}</span>}
          {s.size > 0 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{fmtFileSize(s.size)}</span>}
        </div>
      </button>
    );
  };

  // Conversation view (when a session is open — full overlay column)
  if (selectedSession) {
    const proj = PROJECT_MAP[selectedSession.project];
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 110px)", overflow: "hidden" }}>
        {/* Back + header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, background: "rgba(255,255,255,0.02)", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <button
            onClick={() => setSelectedSession(null)}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer", flexShrink: 0, marginTop: 2 }}
          >← Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#ececec", lineHeight: 1.3 }}>
                {selectedSession.title || selectedSession.firstPrompt?.slice(0, 100) || "Conversation"}
              </div>
              {proj && (
                <span style={{ fontSize: 9, padding: "3px 9px", borderRadius: 999, background: "rgba(224,53,53,0.18)", color: "#ff9c9c", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {proj.category}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {proj && <span style={metaTag}>{proj.label}</span>}
              {selectedSession.ts && <span style={metaTag}>{new Date(selectedSession.ts).toLocaleString()}</span>}
              {selectedSession.size > 0 && <span style={metaTag}>{fmtFileSize(selectedSession.size)}</span>}
              {selectedSession.sessionId && <span style={metaTag}>#{selectedSession.sessionId.slice(0, 8)}</span>}
            </div>
          </div>
        </div>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
          {loadingMsgs && <div style={{ textAlign: "center", padding: "48px 0", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Loading…</div>}
          {!loadingMsgs && messages.map((m, i) => {
            if (m.role === "meta") return (
              <div key={i} style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.25)", padding: "8px 0", fontStyle: "italic" }}>— {m.text} —</div>
            );
            const isUser = m.role === "user";
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: isUser ? "#ff9c9c" : "rgba(255,255,255,0.3)", marginBottom: 5, display: "flex", gap: 8 }}>
                  {isUser ? "You" : "Claude"}
                  {m.ts && <span style={{ fontWeight: 400, opacity: 0.6 }}>{fmtTime(m.ts)}</span>}
                </div>
                <div style={{
                  maxWidth: isUser ? "70%" : "80%", padding: "11px 15px",
                  borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: isUser ? "linear-gradient(135deg, rgba(224,53,53,0.22), rgba(224,53,53,0.1))" : "rgba(255,255,255,0.04)",
                  border: isUser ? "1px solid rgba(224,53,53,0.3)" : "1px solid rgba(255,255,255,0.07)",
                  fontSize: 13, color: "#ececec", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {m.text}
                  {m.truncated && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontStyle: "italic", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>Truncated — full text in JSONL</div>}
                </div>
              </div>
            );
          })}
          {!loadingMsgs && messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No readable messages</div>
          )}
        </div>
      </div>
    );
  }

  // Default view — scrollable single column
  return (
    <div style={{ height: "calc(100vh - 110px)", overflowY: "auto", padding: "0 0 40px" }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      {/* Stats banner */}
      <div style={{
        margin: "0 0 20px", padding: "18px 20px",
        borderRadius: 16, border: "1px solid rgba(224,53,53,0.2)",
        background: "linear-gradient(135deg, rgba(224,53,53,0.12), rgba(255,255,255,0.02) 60%, rgba(255,255,255,0.01))",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff9c9c", marginBottom: 4 }}>Memory System</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Claude Code conversation archive — all sessions, tools, and agent interactions</div>
          </div>
          {[
            { val: folders.length, label: "Projects" },
            { val: sessions.length || "—", label: "Sessions" },
            { val: stats?.worker?.activeSessions ?? "—", label: "Active", green: true },
          ].map(({ val, label, green }: any) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: green ? "#86efac" : "#ececec", letterSpacing: "-0.02em" }}>{val}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.06em" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
          {(indexStatus.pending > 0 || indexStatus.analyzing > 0) && (
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#ff9c9c",
              animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0,
            }} />
          )}
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            {indexStatus.indexed} indexed
            {indexStatus.pending > 0 ? ` · ${indexStatus.pending} pending` : ""}
            {indexStatus.analyzing > 0 ? ` · ${indexStatus.analyzing} analyzing` : ""}
          </span>
        </div>
        <button
          title="Reindex all conversations"
          onClick={() => {
            fetch("/api/conversations/index/reindex", { method: "POST" }).catch(() => {});
            setIndexStatus(prev => ({ ...prev, pending: prev.indexed, indexed: 0 }));
          }}
          style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, padding: "3px 8px", cursor: "pointer",
            fontSize: 10, color: "rgba(255,255,255,0.4)",
          }}
        >
          ↺ Reindex
        </button>
      </div>
      </div>

      {/* Project cards */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 12 }}>
        Projects
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 28 }}>
        {CORE_PROJECTS.map(cp => {
          const fileCount = cp.folderIds.reduce((acc, fid) => acc + (folders.find(f => f.id === fid)?.files || 0), 0);
          if (fileCount === 0) return null;
          const fid = cp.folderIds.find(f => folders.find(fo => fo.id === f)) || "";
          const isActive = selectedFolder === fid;
          return (
            <button
              key={cp.id}
              onClick={() => setSelectedFolder(isActive ? "all" : fid)}
              style={{
                textAlign: "left", padding: "14px 15px", borderRadius: 14,
                background: isActive ? "linear-gradient(135deg, rgba(224,53,53,0.2), rgba(255,255,255,0.03))" : "rgba(255,255,255,0.03)",
                border: isActive ? "1px solid rgba(224,53,53,0.4)" : "1px solid rgba(255,255,255,0.07)",
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = "rgba(224,53,53,0.25)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; } }}
            >
              <div style={{ fontSize: 20, marginBottom: 6 }}>{cp.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#ececec", marginBottom: 2 }}>{cp.label}</div>
              <div style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(224,53,53,0.12)", color: "#ff9c9c", display: "inline-block", marginBottom: 6 }}>
                {fileCount} sessions
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>{PROJECT_MAP[fid]?.description || ""}</div>
            </button>
          );
        })}
        {miscFolders.map(f => (
          <button key={f.id} onClick={() => setSelectedFolder(selectedFolder === f.id ? "all" : f.id)}
            style={{ textAlign: "left", padding: "14px 15px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer" }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>📁</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#ececec", marginBottom: 4 }}>{resolveProjectLabel(f.id)}</div>
            <div style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", display: "inline-block" }}>{f.files} sessions</div>
          </button>
        ))}
      </div>

      {/* Filter + search bar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginRight: 4 }}>
          {selectedFolder === "all" ? "All Conversations" : (PROJECT_MAP[selectedFolder]?.label || resolveProjectLabel(selectedFolder))}
        </div>
        <input
          style={{ flex: 1, minWidth: 160, maxWidth: 280, padding: "7px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, fontSize: 12, color: "#ececec", outline: "none" }}
          placeholder="Search…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {selectedFolder !== "all" && (
          <button onClick={() => setSelectedFolder("all")} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer" }}>
            Clear filter
          </button>
        )}
      </div>

      {/* Session cards */}
      {loadingSessions && <div style={{ textAlign: "center", padding: "32px 0", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Loading…</div>}
      {!loadingSessions && mainSessions.length > 0 && (
        <>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 8 }}>Conversations · {mainSessions.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8, marginBottom: 20 }}>
            {mainSessions.map(renderSessionCard)}
          </div>
        </>
      )}
      {!loadingSessions && subSessions.length > 0 && (
        <>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 8 }}>Subagents · {subSessions.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
            {subSessions.map(renderSessionCard)}
          </div>
        </>
      )}
      {!loadingSessions && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          {searchQuery ? "No matching sessions" : "No sessions in this project"}
        </div>
      )}
    </div>
  );
}

/* ─── Office ─── */

export function OfficePage({ data, context, focus }: PageProps) {
  const zones = data.office?.zones || [];
  const selected = context?.type === "office" ? context.item : zones[0];

  return (
    <div className="split" style={{ gridTemplateColumns: "280px 1fr", gap: 24 }}>
      <div>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Office Zones</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {zones.map((zone: any) => (
            <button
              key={zone.id}
              className={cn("list-item", selected?.id === zone.id && "list-item-active")}
              onClick={() => focus("office", zone)}
            >
              <span className={cn("status-dot", dotTone(zone.state))} />
              <div className="list-item-content">
                <div className="list-item-title">{zone.name}</div>
                <div className="list-item-sub">{zone.lead}</div>
              </div>
              <StatusBadge value={zone.state} />
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={cn("status-dot", dotTone(selected.state))} />
              <span className="text-lg font-semibold">{selected.name}</span>
              <StatusBadge value={selected.state} />
            </div>
            <div className="text-sm text-2" style={{ lineHeight: 1.6 }}>{selected.summary}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Lead", value: selected.lead },
              { label: "Route", value: selected.route },
              { label: "Priority", value: selected.priority },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-3">{f.label}</div>
                <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
              </div>
            ))}
          </div>

          {selected.linkedPages?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="text-xs text-3" style={{ marginBottom: 6 }}>Linked pages</div>
              <TagRow values={selected.linkedPages} />
            </div>
          )}
          {selected.linkedEntities?.length > 0 && (
            <div>
              <div className="text-xs text-3" style={{ marginBottom: 6 }}>Linked entities</div>
              <TagRow values={selected.linkedEntities} />
            </div>
          )}
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a zone</span></div>
      )}
    </div>
  );
}

/* ─── Team ─── */

export function TeamPage({ data, context, focus }: PageProps) {
  const units = data.team?.units || [];
  const selected = context?.type === "team" ? context.item : units[0];

  return (
    <div className="split" style={{ gridTemplateColumns: "280px 1fr", gap: 24 }}>
      <div>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Teams</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {units.map((unit: any) => (
            <button
              key={unit.id}
              className={cn("list-item", selected?.id === unit.id && "list-item-active")}
              onClick={() => focus("team", unit)}
            >
              <span className={cn("status-dot", dotTone(unit.status))} />
              <div className="list-item-content">
                <div className="list-item-title">{unit.name}</div>
                <div className="list-item-sub">{unit.lead} · {unit.members?.length || 0} members</div>
              </div>
              <StatusBadge value={unit.status} />
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={cn("status-dot", dotTone(selected.status))} />
              <span className="text-lg font-semibold">{selected.name}</span>
              <StatusBadge value={selected.status} />
            </div>
            <div className="text-sm text-2">{selected.focus}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Lead", value: selected.lead },
              { label: "Members", value: String(selected.members?.length || 0) },
              { label: "State", value: selected.status },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-3">{f.label}</div>
                <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
              </div>
            ))}
          </div>

          {selected.members?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="text-xs text-3" style={{ marginBottom: 8 }}>Members</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {selected.members.map((member: string) => (
                  <div key={member} className="text-sm text-2" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>{member}</div>
                ))}
              </div>
            </div>
          )}

          {selected.surfaces?.length > 0 && (
            <div>
              <div className="text-xs text-3" style={{ marginBottom: 6 }}>Surfaces</div>
              <TagRow values={selected.surfaces} />
            </div>
          )}
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a team</span></div>
      )}
    </div>
  );
}

/* ─── Claude Mem ─── */

export function ClaudeMemPage(_props: PageProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <span className="section-title">Claude Mem</span>
        <span className="text-xs text-3">Memory stream</span>
      </div>
      <iframe
        src="/claude-mem"
        style={{ flex: 1, border: "none", borderRadius: 8, minHeight: 500, width: "100%" }}
        title="Claude Mem Viewer"
      />
    </div>
  );
}
