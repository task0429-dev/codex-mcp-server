import { useState, useEffect, useRef, useCallback } from "react";
import { Btn, StatusBadge, TagRow } from "./shell";
import { cn, formatRelative, dotTone, type PageProps } from "./types";

// ── Lightweight markdown renderer ────────────────────────────────────────────
function renderMarkdown(text: string, keyword: string, matchCollector: HTMLElement[]): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  function inlineHighlight(raw: string, key: string | number): React.ReactNode {
    // Apply keyword highlight on top of inline markdown
    if (!keyword) return inlineMarkdown(raw, key);
    const lower = raw.toLowerCase();
    const kw = keyword.toLowerCase();
    const parts: React.ReactNode[] = [];
    let cursor = 0, idx = lower.indexOf(kw, 0), pidx = 0;
    while (idx !== -1) {
      if (idx > cursor) parts.push(...flatInline(raw.slice(cursor, idx), `${key}-pre${pidx}`));
      parts.push(
        <mark key={`${key}-m${pidx}`} ref={el => { if (el) matchCollector.push(el as HTMLElement); }}
          style={{ background: "rgba(245,158,11,0.45)", color: "#fcd34d", borderRadius: 3, padding: "0 2px", fontWeight: 700 }}>
          {raw.slice(idx, idx + keyword.length)}
        </mark>
      );
      cursor = idx + keyword.length;
      idx = lower.indexOf(kw, cursor);
      pidx++;
    }
    if (cursor < raw.length) parts.push(...flatInline(raw.slice(cursor), `${key}-suf`));
    return <>{parts}</>;
  }

  function flatInline(raw: string, key: string | number): React.ReactNode[] {
    return [inlineMarkdown(raw, key)];
  }

  function inlineMarkdown(raw: string, key: string | number): React.ReactNode {
    // Bold **text**, inline code `code`
    const parts: React.ReactNode[] = [];
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
    let last = 0, m: RegExpExecArray | null, pi = 0;
    while ((m = re.exec(raw)) !== null) {
      if (m.index > last) parts.push(<span key={`${key}-t${pi}`}>{raw.slice(last, m.index)}</span>);
      if (m[2]) parts.push(<strong key={`${key}-b${pi}`} style={{ fontWeight: 700, color: "inherit" }}>{m[2]}</strong>);
      else if (m[3]) parts.push(<code key={`${key}-c${pi}`} style={{ fontFamily: "var(--font-mono)", fontSize: "0.88em", background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}>{m[3]}</code>);
      else if (m[4]) parts.push(<em key={`${key}-e${pi}`} style={{ fontStyle: "italic", opacity: 0.85 }}>{m[4]}</em>);
      last = m.index + m[0].length;
      pi++;
    }
    if (last < raw.length) parts.push(<span key={`${key}-tl`}>{raw.slice(last)}</span>);
    return <>{parts}</>;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      nodes.push(
        <div key={`cb${i}`} style={{ margin: "10px 0", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
          {lang && <div style={{ padding: "3px 10px", background: "rgba(255,255,255,0.06)", fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>{lang}</div>}
          <pre style={{ margin: 0, padding: "10px 14px", background: "rgba(0,0,0,0.35)", fontSize: 12, lineHeight: 1.6, overflowX: "auto", color: "#c9d1d9", fontFamily: "var(--font-mono)", whiteSpace: "pre" }}>
            {codeLines.join("\n")}
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      const lvl = hm[1].length;
      const sz = lvl === 1 ? 16 : lvl === 2 ? 14 : 13;
      nodes.push(<div key={`h${i}`} style={{ fontWeight: 800, fontSize: sz, color: "#ececec", margin: "14px 0 6px", lineHeight: 1.3 }}>{inlineHighlight(hm[2], `h${i}`)}</div>);
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      nodes.push(<div key={`hr${i}`} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", margin: "12px 0" }} />);
      i++; continue;
    }

    // Bullet list — collect consecutive
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={`ul${i}`} style={{ margin: "6px 0", paddingLeft: 20, listStyle: "none" }}>
          {items.map((item, ii) => (
            <li key={ii} style={{ marginBottom: 4, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0, marginTop: 2 }}>•</span>
              <span style={{ lineHeight: 1.6 }}>{inlineHighlight(item, `ul${i}-${ii}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^[\s]*\d+[.)]\s/.test(line)) {
      const items: { n: string; text: string }[] = [];
      while (i < lines.length && /^[\s]*\d+[.)]\s/.test(lines[i])) {
        const nm = lines[i].match(/^[\s]*(\d+)[.)]\s(.*)/);
        items.push({ n: nm?.[1] || "1", text: nm?.[2] || "" });
        i++;
      }
      nodes.push(
        <ol key={`ol${i}`} style={{ margin: "6px 0", paddingLeft: 0, listStyle: "none" }}>
          {items.map((item, ii) => (
            <li key={ii} style={{ marginBottom: 5, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: 12, flexShrink: 0, minWidth: 18, textAlign: "right", fontFamily: "var(--font-mono)" }}>{item.n}.</span>
              <span style={{ lineHeight: 1.6 }}>{inlineHighlight(item.text, `ol${i}-${ii}`)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const qlines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) { qlines.push(lines[i].slice(2)); i++; }
      nodes.push(
        <div key={`bq${i}`} style={{ borderLeft: "3px solid rgba(255,255,255,0.2)", paddingLeft: 12, margin: "8px 0", color: "rgba(255,255,255,0.55)", fontStyle: "italic" }}>
          {qlines.map((ql, qi) => <div key={qi}>{inlineHighlight(ql, `bq${i}-${qi}`)}</div>)}
        </div>
      );
      continue;
    }

    // Blank line → spacer
    if (line.trim() === "") {
      nodes.push(<div key={`sp${i}`} style={{ height: 8 }} />);
      i++; continue;
    }

    // Normal paragraph line
    nodes.push(<div key={`p${i}`} style={{ lineHeight: 1.75, marginBottom: 1 }}>{inlineHighlight(line, `p${i}`)}</div>);
    i++;
  }

  return <>{nodes}</>;
}

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

type MemoryProvider = "all" | "claude" | "codex";

const PROVIDER_LABELS: Record<MemoryProvider, string> = {
  all: "All",
  claude: "Claude",
  codex: "Codex",
};

const PROVIDER_THEME: Record<MemoryProvider, {
  badgeBg: string;
  badgeText: string;
  panelBg: string;
  panelBorder: string;
  heroGlow: string;
  searchRing: string;
  summaryLabel: string;
  contextLabel: string;
}> = {
  all: {
    badgeBg: "rgba(224,53,53,0.16)",
    badgeText: "#ffb4b4",
    panelBg: "linear-gradient(160deg, rgba(22,16,20,1) 0%, rgba(10,15,20,1) 55%, rgba(12,10,18,1) 100%)",
    panelBorder: "rgba(224,53,53,0.18)",
    heroGlow: "rgba(224,53,53,0.10)",
    searchRing: "rgba(224,53,53,0.12)",
    summaryLabel: "Unified Memory",
    contextLabel: "Conversation Thread",
  },
  claude: {
    badgeBg: "rgba(99,102,241,0.16)",
    badgeText: "#c7d2fe",
    panelBg: "linear-gradient(160deg, rgba(20,18,30,1) 0%, rgba(14,12,22,1) 100%)",
    panelBorder: "rgba(99,102,241,0.16)",
    heroGlow: "rgba(99,102,241,0.14)",
    searchRing: "rgba(99,102,241,0.12)",
    summaryLabel: "Claude Context",
    contextLabel: "Conversation Context",
  },
  codex: {
    badgeBg: "rgba(20,184,166,0.18)",
    badgeText: "#5eead4",
    panelBg: "linear-gradient(160deg, rgba(9,24,24,1) 0%, rgba(7,15,20,1) 55%, rgba(18,10,10,1) 100%)",
    panelBorder: "rgba(20,184,166,0.18)",
    heroGlow: "rgba(20,184,166,0.12)",
    searchRing: "rgba(20,184,166,0.14)",
    summaryLabel: "Codex Trace",
    contextLabel: "Codex Thread",
  },
};

const PROJECT_MAP: Record<string, { label: string; category: string; description: string; icon: string }> = {
  "C--Users-offic": {
    label: "C2",
    category: "C2 System",
    description: "C2 dashboard, agent control, MCP, claude-mem",
    icon: "🖥",
  },
  "C--Users-offic--claude-mem-observer-sessions": {
    label: "Claude Mem Observer",
    category: "Memory System",
    description: "Memory observer sessions, transcript watch",
    icon: "🧠",
  },
  "c--Users-offic-Documents-Codex-data-te-crm-acquisition-engine": {
    label: "CRM Acquisition Engine",
    category: "Task Enterprise",
    description: "IG-to-CRM lead engine, automation pipeline",
    icon: "📈",
  },
  "c--Users-offic-Downloads-2": {
    label: "Downloads (2)",
    category: "Misc",
    description: "Misc sessions from Downloads folder",
    icon: "📦",
  },
  "c--Users-offic-Downloads-a": {
    label: "Downloads (A)",
    category: "Misc",
    description: "Misc sessions from Downloads folder",
    icon: "📦",
  },
  "c--Users-offic-Sync": {
    label: "Sync / MCP Server",
    category: "Infrastructure",
    description: "MCP server, OpenClaw, multi-agent infra, C2 builds",
    icon: "🔧",
  },
  "codex-task-enterprise": {
    label: "Task Enterprise",
    category: "Task Enterprise",
    description: "Codex work for CRM, lead systems, and business operations",
    icon: "🏢",
  },
  "codex-c2": {
    label: "C2",
    category: "C2 System",
    description: "Codex threads related to C2, mission control, and Memories",
    icon: "🖥",
  },
  "codex-agents": {
    label: "Agent Ecosystem",
    category: "Agent System",
    description: "Codex threads about agent behavior, roles, orchestration, and runtime",
    icon: "🤖",
  },
  "codex-mcp": {
    label: "MCP Command Grid",
    category: "Infrastructure",
    description: "Codex work around MCP servers, tools, routing, and protocol surfaces",
    icon: "⚙️",
  },
  "codex-openclaw": {
    label: "OpenClaw Infra",
    category: "Infrastructure",
    description: "Codex threads tied to gateway, relay, protocol, and OpenClaw-style infrastructure",
    icon: "🔗",
  },
  "codex-memory": {
    label: "Memory Vault",
    category: "Memory System",
    description: "Codex conversations about archives, indexing, transcripts, and memory workflows",
    icon: "🧠",
  },
  "codex-misc": {
    label: "General Threads",
    category: "Misc",
    description: "Codex sessions that do not map cleanly to the main C2 project lanes",
    icon: "🧭",
  },
};

const CORE_PROJECTS_BY_PROVIDER: Record<MemoryProvider, Array<{ id: string; label: string; icon: string; folderIds: string[] }>> = {
  all: [
    { id: "task-enterprise", label: "Task Enterprise", icon: "🏢", folderIds: ["c--Users-offic-Documents-Codex-data-te-crm-acquisition-engine", "codex-task-enterprise"] },
    { id: "c2", label: "C2", icon: "🖥", folderIds: ["C--Users-offic", "c--Users-offic-Sync", "codex-c2"] },
    { id: "agents", label: "Agent Ecosystem", icon: "🤖", folderIds: ["C--Users-offic", "codex-agents"] },
    { id: "mcp", label: "MCP Systems", icon: "⚙️", folderIds: ["c--Users-offic-Sync", "C--Users-offic--claude-mem-observer-sessions", "codex-mcp"] },
    { id: "openclaw", label: "OpenClaw Infra", icon: "🔗", folderIds: ["c--Users-offic-Sync", "codex-openclaw"] },
    { id: "memory", label: "Memory Vault", icon: "🧠", folderIds: ["C--Users-offic--claude-mem-observer-sessions", "C--Users-offic", "codex-memory"] },
    { id: "misc", label: "General Threads", icon: "🧭", folderIds: ["c--Users-offic-Downloads-2", "c--Users-offic-Downloads-a", "codex-misc"] },
  ],
  claude: [
    { id: "task-enterprise", label: "Task Enterprise", icon: "🏢", folderIds: ["c--Users-offic-Documents-Codex-data-te-crm-acquisition-engine"] },
    { id: "c2", label: "C2", icon: "🖥", folderIds: ["C--Users-offic", "c--Users-offic-Sync"] },
    { id: "agents", label: "Agent Ecosystem", icon: "🤖", folderIds: ["C--Users-offic"] },
    { id: "mcp", label: "MCP System", icon: "⚙️", folderIds: ["c--Users-offic-Sync", "C--Users-offic--claude-mem-observer-sessions"] },
    { id: "openclaw", label: "OpenClaw Infra", icon: "🔗", folderIds: ["c--Users-offic-Sync"] },
    { id: "memory", label: "Memory System", icon: "🧠", folderIds: ["C--Users-offic--claude-mem-observer-sessions", "C--Users-offic"] },
    { id: "misc", label: "Other", icon: "📁", folderIds: ["c--Users-offic-Downloads-2", "c--Users-offic-Downloads-a"] },
  ],
  codex: [
    { id: "task-enterprise", label: "Task Enterprise", icon: "🏢", folderIds: ["codex-task-enterprise"] },
    { id: "c2", label: "C2", icon: "🖥", folderIds: ["codex-c2"] },
    { id: "agents", label: "Agent Ecosystem", icon: "🤖", folderIds: ["codex-agents"] },
    { id: "mcp", label: "MCP Command Grid", icon: "⚙️", folderIds: ["codex-mcp"] },
    { id: "openclaw", label: "OpenClaw Infra", icon: "🔗", folderIds: ["codex-openclaw"] },
    { id: "memory", label: "Memory Vault", icon: "🧠", folderIds: ["codex-memory"] },
    { id: "misc", label: "General Threads", icon: "🧭", folderIds: ["codex-misc"] },
  ],
};

function resolveProjectLabel(folderId: string): string {
  return PROJECT_MAP[folderId]?.label || folderId;
}

function resolveProjectIcon(folderId: string): string {
  return PROJECT_MAP[folderId]?.icon || "📁";
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

const TOPIC_COLOR_STYLES: Record<string, { bg: string; text: string; rgb: string }> = {
  red:    { bg: "rgba(224,53,53,0.18)",    text: "#ff9c9c", rgb: "224,53,53" },
  blue:   { bg: "rgba(59,130,246,0.18)",   text: "#93c5fd", rgb: "59,130,246" },
  green:  { bg: "rgba(34,197,94,0.18)",    text: "#86efac", rgb: "34,197,94" },
  purple: { bg: "rgba(168,85,247,0.18)",   text: "#d8b4fe", rgb: "168,85,247" },
  amber:  { bg: "rgba(245,158,11,0.18)",   text: "#fcd34d", rgb: "245,158,11" },
  teal:   { bg: "rgba(20,184,166,0.18)",   text: "#5eead4", rgb: "20,184,166" },
  rose:   { bg: "rgba(244,63,94,0.18)",    text: "#fda4af", rgb: "244,63,94" },
  indigo: { bg: "rgba(99,102,241,0.18)",   text: "#a5b4fc", rgb: "99,102,241" },
};

interface IndexEntry {
  title: string;
  primaryTopic: string;
  topics: string[];
  project: string;
  repair?: ConversationRepairRecord;
  indexedAt: string | null;
  fileSize: number;
  provider: MemoryProvider;
}
interface ConvIndex {
  topicColors: Record<string, string>;
  sessions: Record<string, IndexEntry>;
}
interface IndexStatus { indexed: number; pending: number; analyzing: number; }
type ConversationRepairStatus = "Done" | "In Progress" | "Blocked" | "Planning";
interface ConversationRepairRecord {
  status: ConversationRepairStatus;
  mainProblem: string;
  rootCause: string;
  affectedSystem: string;
  stepsTaken: string[];
  solution: string;
  filesAndTools: string[];
  validationEvidence: string[];
  remainingRisks: string[];
  nextAction: string;
  summary: string;
}

const REPAIR_STATUSES: Array<"all" | ConversationRepairStatus> = ["all", "Done", "In Progress", "Blocked", "Planning"];

function repairStatusStyle(status: ConversationRepairStatus): { bg: string; text: string; border: string } {
  switch (status) {
    case "Done": return { bg: "rgba(34,197,94,0.14)", text: "#86efac", border: "rgba(34,197,94,0.28)" };
    case "Blocked": return { bg: "rgba(239,68,68,0.14)", text: "#fca5a5", border: "rgba(239,68,68,0.28)" };
    case "Planning": return { bg: "rgba(99,102,241,0.14)", text: "#a5b4fc", border: "rgba(99,102,241,0.28)" };
    default: return { bg: "rgba(245,158,11,0.14)", text: "#fcd34d", border: "rgba(245,158,11,0.28)" };
  }
}

function fallbackRepairRecord(indexed: IndexEntry | undefined, session: any): ConversationRepairRecord {
  const title = indexed?.title || session?.title || session?.firstPrompt || "Conversation";
  return {
    status: "In Progress",
    mainProblem: title,
    rootCause: "This conversation has not been reindexed into the structured repair schema yet.",
    affectedSystem: indexed?.primaryTopic || resolveProjectLabel(session?.project || "") || "General System",
    stepsTaken: ["Open the transcript below or run Memories reindex to generate structured steps."],
    solution: "Structured solution pending reindex.",
    filesAndTools: [],
    validationEvidence: ["Legacy index entry loaded."],
    remainingRisks: ["Run reindex so this record can capture exact problem, steps, and solution."],
    nextAction: "Click Reindex to rebuild this conversation into the new learning format.",
    summary: title,
  };
}

function listBlock(title: string, items: string[], color: string) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(items.length ? items : ["No entry captured."]).map((item, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "rgba(235,235,255,0.78)", lineHeight: 1.5 }}>
            <span style={{ color, fontSize: 10, fontFamily: "var(--font-mono)", minWidth: 14 }}>{idx + 1}.</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function sessionIndexKey(session: { provider?: MemoryProvider; sessionId?: string | null }) {
  return `${session.provider || "claude"}:${session.sessionId || ""}`;
}

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
  const [provider, setProvider] = useState<MemoryProvider>(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("c2-memories-provider") : null;
    return stored === "claude" || stored === "codex" || stored === "all" ? stored : "all";
  });
  const [folders, setFolders] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [convIndex, setConvIndex] = useState<ConvIndex>({ topicColors: {}, sessions: {} });
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ indexed: 0, pending: 0, analyzing: 0 });
  const [expandedTopics, setExpandedTopics] = useState<string | null>(null);
  const [convSearch, setConvSearch] = useState("");
  const [convMatchIdx, setConvMatchIdx] = useState(0);
  const [convFullscreen, setConvFullscreen] = useState(false);
  const [sessionsRefreshToken, setSessionsRefreshToken] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | ConversationRepairStatus>("all");
  const convMatchRefs = useRef<HTMLElement[]>([]);
  const convSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!convFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && convSearch === "") setConvFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [convFullscreen, convSearch]);

  useEffect(() => {
    window.localStorage.setItem("c2-memories-provider", provider);
  }, [provider]);

  useEffect(() => {
    setSelectedFolder("all");
    setSelectedSession(null);
    setMessages([]);
    setSearchQuery("");
    fetch(`/api/conversations/projects?provider=${provider}`).then(r => r.json()).then(d => setFolders(d.projects || [])).catch(() => setFolders([]));
  }, [provider]);

  const refreshSessions = useCallback(() => {
    setLoadingSessions(true);
    const url = selectedFolder === "all"
      ? `/api/conversations/sessions?provider=${provider}`
      : `/api/conversations/sessions?provider=${provider}&project=${encodeURIComponent(selectedFolder)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, [provider, selectedFolder]);

  useEffect(() => {
    fetch("/api/conversations/index")
      .then(r => r.json())
      .then((d: ConvIndex) => setConvIndex(d))
      .catch(() => {});

    const es = new EventSource("/api/conversations/index/stream");
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "connected") {
          setIndexStatus(msg.status);
        } else if (msg.type === "indexed" && (msg.key || msg.sessionId) && msg.data) {
          setConvIndex(prev => ({
            ...prev,
            topicColors: msg.topicColors ? { ...prev.topicColors, ...msg.topicColors } : prev.topicColors,
            sessions: { ...prev.sessions, [msg.key || `${msg.data.provider || "claude"}:${msg.sessionId}`]: msg.data },
          }));
          setIndexStatus(prev => ({
            indexed: prev.indexed + 1,
            pending: Math.max(0, prev.pending - 1),
            analyzing: Math.max(0, prev.analyzing - 1),
          }));
          if (provider === "all" || provider === (msg.data.provider || "claude")) {
            setSessionsRefreshToken(prev => prev + 1);
          }
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [provider]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions, sessionsRefreshToken]);

  useEffect(() => {
    const id = window.setInterval(() => setSessionsRefreshToken(prev => prev + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function openSession(s: any) {
    if (selectedSession?.file === s.file && (selectedSession?.provider || provider) === (s.provider || provider)) return;
    setSelectedSession(s);
    setMessages([]);
    setLoadingMsgs(true);
    try {
      const r = await fetch(`/api/conversations/messages?provider=${encodeURIComponent(s.provider || provider)}&file=${encodeURIComponent(s.file)}`);
      const d = await r.json();
      setMessages(d.messages || []);
    } catch { setMessages([]); }
    setLoadingMsgs(false);
  }

  const q = searchQuery.trim().toLowerCase();
  const filtered = sessions.filter(s => {
    const indexed = convIndex.sessions[sessionIndexKey(s)];
    const repair = indexed?.repair;
    const statusMatch = statusFilter === "all" || repair?.status === statusFilter;
    if (!statusMatch) return false;
    if (!q) return true;
    const repairText = repair
      ? `${repair.status} ${repair.mainProblem} ${repair.rootCause} ${repair.affectedSystem} ${repair.stepsTaken.join(" ")} ${repair.solution} ${repair.nextAction} ${repair.summary}`
      : "";
    return `${s.title || ""} ${s.firstPrompt || ""} ${s.cwd || ""}`.toLowerCase().includes(q)
      || (indexed?.title || "").toLowerCase().includes(q)
      || (indexed?.primaryTopic || "").toLowerCase().includes(q)
      || (indexed?.topics || []).some((t: string) => t.toLowerCase().includes(q))
      || repairText.toLowerCase().includes(q);
  });
  const isSubagent = (s: any) => Boolean(s.file?.includes("/subagents/"));
  const mainSessions = filtered.filter(s => !isSubagent(s));
  const subSessions  = filtered.filter(s => isSubagent(s));
  const coreProjects = CORE_PROJECTS_BY_PROVIDER[provider];
  const knownFolderIds = coreProjects.flatMap(p => p.folderIds);
  const miscFolders = folders.filter(f => !knownFolderIds.includes(f.id));
  const indexedVisibleCount = filtered.filter((s) => Boolean(convIndex.sessions[sessionIndexKey(s)]?.indexedAt)).length;
  const statusCounts = sessions.reduce<Record<string, number>>((acc, s) => {
    const status = convIndex.sessions[sessionIndexKey(s)]?.repair?.status || "In Progress";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const providerBlurb = provider === "all"
    ? "Unified conversation archive across Claude and Codex — live indexed sessions with automatic sync into one stream."
    : provider === "claude"
      ? "Claude conversation archive — structured projects, indexed sessions, and transcript context."
      : "Codex workspace archive — structured project lanes, execution traces, and clearly separated session history.";
  const activeTheme = PROVIDER_THEME[provider];

  function normalizeProviderText(text: string, activeProvider: MemoryProvider) {
    if (activeProvider !== "codex") return text;
    return text
      .replace(/\bClaude was running\b/g, "Codex was running")
      .replace(/\bClaude Code\b/g, "Codex")
      .replace(/\bClaude\b/g, "Codex");
  }

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

  // Highlight keyword matches inside message text
  function HighlightedText({ text, keyword, matchCollector }: { text: string; keyword: string; matchCollector: HTMLElement[] }) {
    if (!keyword) return <>{text}</>;
    const lower = text.toLowerCase();
    const kw = keyword.toLowerCase();
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let idx = lower.indexOf(kw, cursor);
    while (idx !== -1) {
      if (idx > cursor) parts.push(text.slice(cursor, idx));
      parts.push(
        <mark
          key={idx}
          ref={el => { if (el) matchCollector.push(el); }}
          style={{
            background: "rgba(245,158,11,0.45)",
            color: "#fcd34d",
            borderRadius: 3,
            padding: "0 2px",
            fontWeight: 700,
          }}
        >
          {text.slice(idx, idx + keyword.length)}
        </mark>
      );
      cursor = idx + keyword.length;
      idx = lower.indexOf(kw, cursor);
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return <>{parts}</>;
  }

  function jumpToConvMatch(direction: 1 | -1) {
    const refs = convMatchRefs.current;
    if (!refs.length) return;
    const next = (convMatchIdx + direction + refs.length) % refs.length;
    setConvMatchIdx(next);
    refs[next]?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Flash the active match
    refs.forEach((el, i) => {
      el.style.background = i === next ? "rgba(245,158,11,0.75)" : "rgba(245,158,11,0.45)";
      el.style.boxShadow = i === next ? "0 0 0 2px rgba(245,158,11,0.6)" : "none";
    });
  }

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
          const indexed = convIndex.sessions[sessionIndexKey(s)];
          const title = indexed?.title || s.title || s.firstPrompt || "Untitled";
          const isAnalyzing = !indexed;
          const repair = indexed?.repair;
          const statusStyle = repair ? repairStatusStyle(repair.status) : null;
          return (
            <>
              {/* Date — always prominent at top */}
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                {s.ts && (
                  <span style={{ background: "rgba(255,255,255,0.06)", padding: "1px 7px", borderRadius: 5, letterSpacing: "0.02em" }}>
                    {new Date(s.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                {s.size > 0 && <span style={{ color: "rgba(255,255,255,0.2)" }}>{fmtFileSize(s.size)}</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ececec", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 5 }}>
                {isAnalyzing ? (
                  <span style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic", fontWeight: 400, animation: "shimmer 1.8s ease-in-out infinite" }}>Analyzing…</span>
                ) : title}
              </div>
              {repair && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 999,
                      background: statusStyle!.bg, color: statusStyle!.text,
                      border: `1px solid ${statusStyle!.border}`,
                      fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                    }}>
                      {repair.status === "Done" ? "Done" : repair.status}
                    </span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {repair.affectedSystem}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(235,235,255,0.65)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {repair.mainProblem}
                  </div>
                </div>
              )}
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
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: PROVIDER_THEME[s.provider || provider].badgeBg, color: PROVIDER_THEME[s.provider || provider].badgeText, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {PROVIDER_LABELS[s.provider || provider]}
          </span>
          {proj && (
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(224,53,53,0.15)", color: "#ff9c9c", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {proj.category}
            </span>
          )}
        </div>
      </button>
    );
  };

  // Conversation view (when a session is open — full overlay column)
  if (selectedSession) {
    const proj = PROJECT_MAP[selectedSession.project];
    const indexed = convIndex.sessions[sessionIndexKey(selectedSession)];
    const sessionTopics = indexed?.topics || [];
    const primaryTopic = indexed?.primaryTopic;
    const sessionProvider = (selectedSession.provider || provider) as MemoryProvider;
    const assistantLabel = sessionProvider === "codex" ? "Codex" : "Claude";
    const sessionTheme = PROVIDER_THEME[sessionProvider];
    const primaryColor = primaryTopic && indexed?.topics[0]
      ? TOPIC_COLOR_STYLES[convIndex.topicColors[indexed.topics[0]]] || TOPIC_COLOR_STYLES["red"]
      : TOPIC_COLOR_STYLES["red"];
    const repair = indexed?.repair || fallbackRepairRecord(indexed, selectedSession);
    const repairTone = repairStatusStyle(repair.status);

    // Reset match refs each render so we collect fresh refs
    convMatchRefs.current = [];
    const kw = convSearch.trim();
    const totalMatches = kw
      ? messages.reduce((acc, m) => acc + (m.text?.toLowerCase().split(kw.toLowerCase()).length - 1 || 0), 0)
      : 0;

    const fsStyle: React.CSSProperties = convFullscreen ? {
      position: "fixed", inset: 0, zIndex: 9999,
    } : {
      height: "calc(100vh - 110px)",
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: sessionTheme.panelBg, boxShadow: `inset 0 0 0 1px ${sessionTheme.panelBorder}`, ...fsStyle }}>
        <style>{`
          @keyframes conv-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
          @keyframes conv-shimmer { 0%,100%{opacity:0.3} 50%{opacity:0.7} }
        `}</style>
        {/* Context banner — topic identity strip */}
        {indexed && indexed.indexedAt && (
          <div style={{
            flexShrink: 0,
            padding: "14px 20px 12px",
            background: `linear-gradient(135deg, ${primaryColor.bg.replace("0.18", "0.28")} 0%, rgba(255,255,255,0.02) 100%)`,
            borderBottom: `1px solid ${primaryColor.text}22`,
            position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", top: -20, right: -20, width: 120, height: 120,
              borderRadius: "50%", background: sessionTheme.heroGlow,
              filter: "blur(30px)", pointerEvents: "none",
            }} />
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: primaryColor.text, marginBottom: 6, opacity: 0.8 }}>{sessionTheme.contextLabel}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#ececec", lineHeight: 1.4, marginBottom: 8 }}>
              {indexed.title}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 999,
                background: repairTone.bg, color: repairTone.text,
                border: `1px solid ${repairTone.border}`,
                fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                {repair.status === "Done" ? "Done" : repair.status}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {repair.affectedSystem}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sessionTopics.map((topic: string) => {
                const c = TOPIC_COLOR_STYLES[convIndex.topicColors[topic]] || TOPIC_COLOR_STYLES["red"];
                return (
                  <span key={topic} style={{
                    fontSize: 10, padding: "3px 10px", borderRadius: 999,
                    background: c.bg, color: c.text, fontWeight: 700, letterSpacing: "0.05em",
                    border: `1px solid ${c.text}33`,
                  }}>{topic}</span>
                );
              })}
            </div>
          </div>
        )}
        {/* Back + header + search bar */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, background: "rgba(255,255,255,0.015)", display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={() => { setSelectedSession(null); setConvSearch(""); setConvMatchIdx(0); }}
            style={{ padding: "6px 13px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}
          >← Back</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ececec", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedSession.title || selectedSession.firstPrompt?.slice(0, 100) || "Conversation"}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: sessionTheme.badgeBg, color: sessionTheme.badgeText, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {PROVIDER_LABELS[sessionProvider]}
              </span>
              {proj && (
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {proj.label}
                </span>
              )}
            </div>
          </div>
          {/* In-conversation search */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{ position: "absolute", left: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", pointerEvents: "none" }}>⌕</span>
              <input
                ref={convSearchInputRef}
                value={convSearch}
                onChange={e => { setConvSearch(e.target.value); setConvMatchIdx(0); convMatchRefs.current = []; }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) jumpToConvMatch(-1);
                    else jumpToConvMatch(1);
                  } else if (e.key === "Escape") {
                    setConvSearch(""); setConvMatchIdx(0);
                  }
                }}
                placeholder="Search in conversation…"
                style={{
                  paddingLeft: 28, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                  width: 220,
                  background: "rgba(255,255,255,0.06)",
                  border: kw ? `1px solid ${sessionTheme.badgeText}` : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 999, fontSize: 12, color: "#ececec", outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  boxShadow: kw ? `0 0 0 3px ${sessionTheme.searchRing}` : "none",
                }}
              />
            </div>
            {kw && (
              <>
                <span style={{ fontSize: 11, color: totalMatches ? "#fcd34d" : "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
                  {totalMatches ? `${Math.min(convMatchIdx + 1, totalMatches)} / ${totalMatches}` : "0 results"}
                </span>
                <button onClick={() => jumpToConvMatch(-1)} title="Previous (Shift+Enter)" style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>↑</button>
                <button onClick={() => jumpToConvMatch(1)} title="Next (Enter)" style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>↓</button>
                <button onClick={() => { setConvSearch(""); setConvMatchIdx(0); }} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer" }}>✕</button>
              </>
            )}
            <button
              onClick={() => setConvFullscreen(f => !f)}
              title={convFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
              style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: convFullscreen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", lineHeight: 1, transition: "all 0.15s" }}
            >
              {convFullscreen ? "⊡" : "⛶"}
            </button>
          </div>
        </div>
        {/* Structured repair summary — always before the raw transcript */}
        <div style={{ flexShrink: 0, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.16)", overflowY: "auto", maxHeight: convFullscreen ? "46vh" : "44vh" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1.05fr) minmax(260px, 1.25fr)", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: "12px 14px", borderRadius: 12, background: `linear-gradient(135deg, ${repairTone.bg}, rgba(255,255,255,0.035))`, border: `1px solid ${repairTone.border}` }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: repairTone.text, marginBottom: 7 }}>Problem</div>
                <div style={{ fontSize: 13, color: "#f4f7fb", lineHeight: 1.55, fontWeight: 650 }}>{repair.mainProblem}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: primaryColor.text, marginBottom: 6 }}>Cause</div>
                  <div style={{ fontSize: 11, color: "rgba(235,235,255,0.78)", lineHeight: 1.5 }}>{repair.rootCause}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: primaryColor.text, marginBottom: 6 }}>Solution</div>
                  <div style={{ fontSize: 11, color: "rgba(235,235,255,0.82)", lineHeight: 1.5 }}>{repair.solution}</div>
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: primaryColor.text, marginBottom: 6 }}>Next Action</div>
                <div style={{ fontSize: 11, color: "rgba(235,235,255,0.78)", lineHeight: 1.5 }}>{repair.nextAction}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {listBlock("Steps Taken", repair.stepsTaken, primaryColor.text)}
              {listBlock("Validation", repair.validationEvidence, "#86efac")}
              {listBlock("Files / Tools", repair.filesAndTools, "#93c5fd")}
              {listBlock("Risks", repair.remainingRisks, repair.remainingRisks.some(r => /no explicit/i.test(r)) ? "rgba(255,255,255,0.38)" : "#fca5a5")}
            </div>
          </div>
          <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", fontSize: 11, lineHeight: 1.55, color: "rgba(235,235,255,0.68)" }}>
            <span style={{ color: primaryColor.text, fontWeight: 800, marginRight: 6 }}>Conversation Summary:</span>
            {repair.summary}
          </div>
        </div>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 0 20px", display: "flex", flexDirection: "column", background: "transparent" }}>
          {loadingMsgs && <div style={{ textAlign: "center", padding: "48px 0", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Loading…</div>}
          {!loadingMsgs && (() => {
            // Segment by `meta` (ai-title) only — color cycles through indexed topics
            // summaries render inline, never split the flow
            const topicColorList = sessionTopics.length > 0
              ? sessionTopics.map((t: string) => TOPIC_COLOR_STYLES[convIndex.topicColors[t]] || TOPIC_COLOR_STYLES["red"])
              : [TOPIC_COLOR_STYLES["blue"], TOPIC_COLOR_STYLES["purple"], TOPIC_COLOR_STYLES["teal"],
                 TOPIC_COLOR_STYLES["amber"], TOPIC_COLOR_STYLES["green"], TOPIC_COLOR_STYLES["indigo"]];

            type Seg = { color: typeof topicColorList[0]; msgs: typeof messages };
            const segments: Seg[] = [];
            let cur: typeof messages = [];
            let ci = 0;

            for (const m of messages) {
              if (m.role === "meta") {
                if (cur.length) { segments.push({ color: topicColorList[ci % topicColorList.length], msgs: cur }); ci++; cur = []; }
                segments.push({ color: topicColorList[ci % topicColorList.length], msgs: [m] });
              } else {
                cur.push(m);
              }
            }
            if (cur.length) segments.push({ color: topicColorList[ci % topicColorList.length], msgs: cur });

            return segments.map((seg, si) => {
              // Meta divider — section title
              if (seg.msgs.length === 1 && seg.msgs[0].role === "meta") {
                return (
                  <div key={si} style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 20px 10px", opacity: 0.6 }}>
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${seg.color.text}44, transparent)` }} />
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: seg.color.text }}>{seg.msgs[0].text}</span>
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(270deg, ${seg.color.text}44, transparent)` }} />
                  </div>
                );
              }

              const c = seg.color;
              const rgb = c.rgb;

              // Collect key details from this segment for the bracket sidebar
              const keyDetails: string[] = [];
              const summaryMsgs = seg.msgs.filter((m: any) => m.role === "summary");
              const userMsgs = seg.msgs.filter((m: any) => m.role === "user");
              const toolMsgs = seg.msgs.filter((m: any) => m.role === "tools");

              // Add resumed context details
              summaryMsgs.slice(0, 2).forEach((m: any) => {
                const parts = (m.text || "").split(" · ");
                if (parts.length === 2) {
                  keyDetails.push(parts[1].slice(0, 60));
                } else if (m.text && m.text.length > 4) {
                  keyDetails.push(m.text.slice(0, 60));
                }
              });

              // Add first substantial user message as a key detail if no summaries
              if (keyDetails.length === 0 && userMsgs[0]?.text) {
                keyDetails.push(userMsgs[0].text.split("\n")[0].slice(0, 60));
              }

              // Add tool usage summary
              if (toolMsgs.length > 0) {
                const allTools = toolMsgs.flatMap((m: any) => m.tools as string[]);
                const unique = [...new Set(allTools)].slice(0, 4);
                keyDetails.push(`⚙ ${unique.join(", ")}`);
              }

              return (
                <div key={si} style={{ display: "flex", gap: 0, margin: "0 0 16px", alignItems: "stretch" }}>
                  {/* Left bracket + key details sidebar */}
                  <div style={{ width: 120, flexShrink: 0, display: "flex", alignItems: "stretch", paddingLeft: 12, paddingRight: 8, paddingTop: 8, paddingBottom: 8, position: "relative" }}>
                    {/* Key detail bullets */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 5, paddingRight: 10 }}>
                      {keyDetails.map((d, di) => (
                        <div key={di} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                          <span style={{ color: c.text, fontSize: 9, flexShrink: 0, marginTop: 2, opacity: 0.9 }}>•</span>
                          <span style={{ fontSize: 9.5, color: c.text, lineHeight: 1.4, opacity: 0.85, wordBreak: "break-word" }}>{d}</span>
                        </div>
                      ))}
                    </div>
                    {/* SVG bracket */}
                    <svg width="18" height="100%" viewBox="0 0 18 100" preserveAspectRatio="none" style={{ position: "absolute", right: 0, top: 0, bottom: 0, height: "100%", display: "block" }}>
                      <path d={`M14,2 Q4,2 4,10 L4,44 Q4,50 2,50 Q4,50 4,56 L4,90 Q4,98 14,98`}
                        fill="none" stroke={c.text} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
                    </svg>
                  </div>

                  {/* Gradient colored content block */}
                  <div style={{
                    flex: 1,
                    borderRadius: "0 14px 14px 0",
                    background: `linear-gradient(135deg, rgba(${rgb},0.13) 0%, rgba(${rgb},0.06) 50%, rgba(${rgb},0.03) 100%)`,
                    border: `1px solid rgba(${rgb},0.2)`,
                    borderLeft: `3px solid rgba(${rgb},0.5)`,
                    overflow: "hidden",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", padding: "10px 20px 14px" }}>
                      {seg.msgs.map((m: any, mi: number) => {
                        if (m.role === "summary") {
                          const parts = (m.text || "").split(" · ");
                          const hasTwoParts = parts.length === 2;
                          return (
                            <div key={mi} title={m.full || m.text} style={{ margin: "4px 0 8px", padding: "7px 12px", borderRadius: 8, background: `rgba(${rgb},0.08)`, border: `1px solid rgba(${rgb},0.15)`, cursor: "help", display: "flex", flexDirection: "column", gap: 3 }}>
                              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: c.text, opacity: 0.7 }}>↩ {sessionTheme.summaryLabel}</span>
                              {hasTwoParts ? (
                                <>
                                  <div style={{ fontSize: 10.5, color: `rgba(${rgb},0.55)`, fontStyle: "italic", lineHeight: 1.4 }}>{normalizeProviderText(parts[0], sessionProvider)}</div>
                                  <div style={{ fontSize: 11, color: "rgba(235,235,255,0.85)", lineHeight: 1.4 }}>
                                    <span style={{ color: c.text, fontWeight: 700, marginRight: 4 }}>→</span>{normalizeProviderText(parts[1].slice(0, 140), sessionProvider)}
                                  </div>
                                </>
                              ) : (
                                <div style={{ fontSize: 11, color: "rgba(235,235,255,0.85)", lineHeight: 1.4 }}>{normalizeProviderText(m.text, sessionProvider)}</div>
                              )}
                            </div>
                          );
                        }
                        if (m.role === "tools") {
                          return (
                            <div key={mi} style={{ margin: "2px 0 6px", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 9, color: `rgba(${rgb},0.5)`, letterSpacing: "0.08em", textTransform: "uppercase" }}>⚙</span>
                              {(m.tools as string[]).map((tool: string, ti: number) => (
                                <span key={ti} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 5, background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.18)`, color: c.text, fontFamily: "var(--font-mono)", opacity: 0.7 }}>{tool}</span>
                              ))}
                            </div>
                          );
                        }
                        const isUser = m.role === "user";
                        return (
                            <div key={mi} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginBottom: 14 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: isUser ? c.text : "rgba(255,255,255,0.4)", marginBottom: 4, display: "flex", gap: 8, alignItems: "center" }}>
                              {isUser ? "You" : assistantLabel}
                              {m.ts && <span style={{ fontWeight: 400, opacity: 0.5, textTransform: "none", letterSpacing: 0 }}>{fmtTime(m.ts)}</span>}
                            </div>
                            <div style={{
                              maxWidth: isUser ? "80%" : "92%", padding: "10px 14px",
                              borderRadius: isUser ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                              background: isUser
                                ? `linear-gradient(135deg, rgba(${rgb},0.28), rgba(${rgb},0.12))`
                                : "rgba(255,255,255,0.045)",
                              border: isUser ? `1px solid rgba(${rgb},0.4)` : "1px solid rgba(255,255,255,0.07)",
                              boxShadow: isUser ? `0 2px 12px rgba(${rgb},0.18)` : "0 2px 6px rgba(0,0,0,0.25)",
                              fontSize: 13, color: isUser ? "#fff" : "#dde6f0", wordBreak: "break-word",
                            }}>
                              {isUser
                                ? <HighlightedText text={m.text} keyword={kw} matchCollector={convMatchRefs.current} />
                                : renderMarkdown(normalizeProviderText(m.text, sessionProvider), kw, convMatchRefs.current)
                              }
                              {m.truncated && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontStyle: "italic", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>Truncated</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
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
        @keyframes shimmer {
          0% { opacity: 0.3; }
          50% { opacity: 0.6; }
          100% { opacity: 0.3; }
        }
      `}</style>
      {/* Stats banner */}
      <div style={{
        margin: "0 0 20px", padding: "18px 20px",
        borderRadius: 16, border: "1px solid rgba(224,53,53,0.2)",
        background: provider === "codex"
          ? "linear-gradient(135deg, rgba(20,184,166,0.14), rgba(255,255,255,0.02) 55%, rgba(224,53,53,0.06))"
          : provider === "all"
            ? "linear-gradient(135deg, rgba(224,53,53,0.14), rgba(20,184,166,0.06) 45%, rgba(99,102,241,0.08))"
            : "linear-gradient(135deg, rgba(224,53,53,0.12), rgba(255,255,255,0.02) 60%, rgba(255,255,255,0.01))",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: provider === "codex" ? "#5eead4" : provider === "all" ? "#ffb4b4" : "#ff9c9c", marginBottom: 4 }}>{provider === "codex" ? "Codex Memory" : provider === "all" ? "Unified Memory" : "Claude Memory"}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{providerBlurb}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {(["all", "claude", "codex"] as MemoryProvider[]).map((name) => (
                <button key={name} onClick={() => setProvider(name)} style={pill(provider === name)}>
                  {PROVIDER_LABELS[name]}
                </button>
              ))}
            </div>
          </div>
          {[
            { val: folders.length, label: "Projects" },
            { val: sessions.length || "—", label: "Sessions" },
            { val: indexedVisibleCount || "—", label: "Indexed", green: true },
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
        {PROVIDER_LABELS[provider]} Projects
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 28 }}>
        {coreProjects.map(cp => {
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
            <div style={{ fontSize: 20, marginBottom: 6 }}>{resolveProjectIcon(f.id)}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#ececec", marginBottom: 4 }}>{resolveProjectLabel(f.id)}</div>
            <div style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", display: "inline-block" }}>{f.files} sessions</div>
          </button>
        ))}
      </div>

      {/* Filter + search bar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", flex: 1, minWidth: 120 }}>
          {selectedFolder === "all"
            ? `${PROVIDER_LABELS[provider]} Conversations`
            : (PROJECT_MAP[selectedFolder]?.label || resolveProjectLabel(selectedFolder))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {REPAIR_STATUSES.map(status => {
            const active = statusFilter === status;
            const tone = status === "all" ? { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.55)", border: "rgba(255,255,255,0.1)" } : repairStatusStyle(status);
            const count = status === "all" ? sessions.length : (statusCounts[status] || 0);
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                  background: active ? tone.bg : "rgba(255,255,255,0.025)",
                  border: `1px solid ${active ? tone.border : "rgba(255,255,255,0.07)"}`,
                  color: active ? tone.text : "rgba(255,255,255,0.38)",
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
                }}
              >
                {status === "all" ? "All" : status === "Done" ? "Done" : status} {count}
              </button>
            );
          })}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 12, fontSize: 13, color: "rgba(255,255,255,0.3)", pointerEvents: "none" }}>⌕</span>
          <input
            style={{
              paddingLeft: 32, paddingRight: searchQuery ? 32 : 14, paddingTop: 8, paddingBottom: 8,
              width: 260, background: "rgba(255,255,255,0.05)",
              border: searchQuery ? "1px solid rgba(224,53,53,0.45)" : "1px solid rgba(255,255,255,0.09)",
              borderRadius: 999, fontSize: 12, color: "#ececec", outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
              boxShadow: searchQuery ? "0 0 0 3px rgba(224,53,53,0.1)" : "none",
            }}
            placeholder="Search conversations, topics, keywords…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setSearchQuery(""); }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{ position: "absolute", right: 10, background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 13, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
            >✕</button>
          )}
        </div>
        {selectedFolder !== "all" && (
          <button onClick={() => setSelectedFolder("all")} style={{ padding: "6px 13px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer" }}>
            Clear filter
          </button>
        )}
        {statusFilter !== "all" && (
          <button onClick={() => setStatusFilter("all")} style={{ padding: "6px 13px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer" }}>
            Clear status
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
