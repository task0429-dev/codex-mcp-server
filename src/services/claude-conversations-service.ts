import fs from "fs";
import os from "os";
import path from "path";

type SessionSource = "claude" | "codex";

type ProjectSummary = {
  id: string;
  name: string;
  folderIds: string[];
  fileCount: number;
  sessionCount: number;
  activeCount: number;
};

export type SessionSummary = {
  file: string;
  project: string;
  projectName: string;
  sessionId: string;
  title: string | null;
  cwd: string | null;
  firstPrompt: string | null;
  ts: string;
  size: number;
  isSubagent: boolean;
  folderId: string;
  source: SessionSource;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  text: string;
  ts: string | null;
  truncated: boolean;
};

const ROOTS = [
  path.join(os.homedir(), ".claude", "projects"),
  path.join(os.homedir(), ".claude", "sessions"),
  path.join(os.homedir(), ".codex", "threads"),
  path.join(os.homedir(), ".codex", "sessions"),
  path.join(os.homedir(), ".codex", "archived_sessions"),
  path.join(process.cwd(), ".claude", "projects"),
  path.join(process.cwd(), ".claude", "sessions"),
  path.join(process.cwd(), ".codex", "threads"),
  path.join(process.cwd(), ".codex", "sessions"),
  path.join(process.cwd(), ".codex", "archived_sessions"),
  path.join(process.cwd(), "data"),
  path.join(process.cwd(), "workspaces"),
  // Docker mount overrides via env vars
  ...(process.env.CLAUDE_PROJECTS_DIR ? [process.env.CLAUDE_PROJECTS_DIR] : []),
  ...(process.env.CODEX_SESSIONS_DIR ? [process.env.CODEX_SESSIONS_DIR] : []),
];

const MAX_DEPTH = 6;
const MAX_FILES = 1600;
const SESSION_FILE_PATTERN = /\.(json|jsonl|md|txt|log)$/i;
const PREVIEW_BYTES = 128 * 1024;
const SESSIONS_CACHE_TTL_MS = 15_000;

let sessionsCache: { ts: number; sessions: SessionSummary[] } | null = null;

function safeStat(fullPath: string) {
  try {
    return fs.statSync(fullPath);
  } catch {
    return null;
  }
}

function walkFiles(root: string, depth = 0, files: string[] = []): string[] {
  if (depth > MAX_DEPTH || files.length >= MAX_FILES) return files;
  if (!fs.existsSync(root)) return files;

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, depth + 1, files);
      continue;
    }

    if (SESSION_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizePath(fullPath: string) {
  return fullPath.replace(/\\/g, "/").toLowerCase();
}

function detectSource(fullPath: string): SessionSource {
  const normalized = normalizePath(fullPath);
  if (normalized.includes("/.codex/")) return "codex";
  if (process.env.CODEX_SESSIONS_DIR && normalized.startsWith(normalizePath(process.env.CODEX_SESSIONS_DIR))) return "codex";
  return "claude";
}

function readPreview(filePath: string) {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(PREVIEW_BYTES);
      const bytesRead = fs.readSync(fd, buffer, 0, PREVIEW_BYTES, 0);
      return buffer.toString("utf8", 0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

function readTextFile(filePath: string) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function firstPromptFromContent(content: string): string | null {
  const firstUserMessage = parseMessages(content).find((message) => message.role === "user");
  if (firstUserMessage?.text) {
    return firstUserMessage.text.slice(0, 180);
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines[0] ? lines[0].slice(0, 180) : null;
}

function titleFromContent(filePath: string, content: string): string | null {
  const messages = parseMessages(content);
  const isSystem = (t: string) => /^(you are|you're|your role|\[\$task|<ide_|<task_|<local-|<command-|\{"type"|\{"timestamp"|\{"ts"|#\s+files\s+mentioned)/i.test(t.trim());

  // Find first real user message (not a system/skill/JSON injection)
  const userMsg = messages.find((m) => m.role === "user" && m.text && !isSystem(m.text));
  const raw = userMsg?.text || path.basename(filePath, path.extname(filePath));

  // If still a system prompt, use filename
  if (isSystem(raw)) return path.basename(filePath, path.extname(filePath)).slice(0, 60);

  // Take first line/clause only, strip filler, cap at 60 chars
  const clause = raw.split(/\n/)[0].trim().split(/[.!?]/)[0].trim();
  const cleaned = clause
    .replace(/^(hey|hi|ok|okay|so|uh|can you|could you|please|i need you to|i need|i want|i'd like|can u)\s+/i, "")
    .replace(/^(to|the|a|an)\s+/i, "")
    .trim();
  const titled = (cleaned || clause || raw).replace(/^(.)/, (c) => c.toUpperCase());
  return titled.length > 60 ? `${titled.slice(0, 59).trimEnd()}…` : titled;
}

function firstJsonRecord(content: string): Record<string, any> | null {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, any>;
      }
    } catch {
      // ignore malformed lines
    }
  }
  return null;
}

function projectLabel(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugify(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "default";
}

function inferProject(filePath: string, content: string, source: SessionSource) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const meta = firstJsonRecord(content);
  const metaPayload = meta && typeof meta.payload === "object" ? meta.payload : null;
  const metaCwd = typeof metaPayload?.cwd === "string" ? metaPayload.cwd : typeof meta?.cwd === "string" ? meta.cwd : null;

  if (source === "codex") {
    const cwd = metaCwd;
    if (cwd) {
      const base = path.basename(cwd.replace(/\\/g, "/")) || "codex";
      return { project: slugify(base), projectName: projectLabel(base), cwd };
    }

    const threadName = typeof meta?.thread_name === "string" ? meta.thread_name : null;
    if (threadName) {
      return { project: slugify(threadName), projectName: threadName.slice(0, 80), cwd: null };
    }

    return { project: "codex", projectName: "Codex", cwd: null };
  }

  if (metaCwd) {
    const base = path.basename(metaCwd.replace(/\\/g, "/")) || "claude";
    return { project: slugify(base), projectName: projectLabel(base), cwd: metaCwd };
  }

  const projectIndex = parts.lastIndexOf("projects");
  if (projectIndex >= 0 && parts[projectIndex + 1]) {
    const projectPart = parts[projectIndex + 1];
    return { project: slugify(projectPart), projectName: projectLabel(projectPart), cwd: null };
  }

  const projectPart = parts[parts.length - 3] || "default";
  return { project: slugify(projectPart), projectName: projectLabel(projectPart), cwd: null };
}

function shouldKeepSession(filePath: string, content: string, source: SessionSource) {
  const normalized = normalizePath(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (source === "codex") {
    const codexMatch = normalized.includes("/.codex/sessions/") || normalized.includes("/.codex/threads/") || normalized.includes("/.codex/archived_sessions/")
      || (process.env.CODEX_SESSIONS_DIR && normalized.startsWith(normalizePath(process.env.CODEX_SESSIONS_DIR)));
    if (codexMatch) {
      if (extension !== ".json" && extension !== ".jsonl") return false;
      return /session_meta|thread_name|"messages"|"role"\s*:/i.test(content);
    }
    return false;
  }

  if (normalized.includes("/.claude/projects/") || normalized.includes("/.claude/sessions/")
    || (process.env.CLAUDE_PROJECTS_DIR && normalized.startsWith(normalizePath(process.env.CLAUDE_PROJECTS_DIR)))) {
    return extension === ".json" || extension === ".jsonl";
  }

  return false;
}

function toSession(filePath: string): SessionSummary | null {
  const stat = safeStat(filePath);
  if (!stat?.isFile()) return null;
  if (/[\\/](subagents?|workers?|explorers?)[\\/]/i.test(filePath)) return null;
  if (/\.meta\.json$/i.test(filePath)) return null;

  const source = detectSource(filePath);
  const content = readPreview(filePath);
  if (!shouldKeepSession(filePath, content, source)) return null;

  const inferred = inferProject(filePath, content, source);
  if (source === "codex") {
    const inferredCwd = (inferred.cwd || "").replace(/\\/g, "/").toLowerCase();
    // Ignore internal container-local codex runs; keep real desktop workspace sessions.
    if (inferredCwd.startsWith("/app/.codex/")) {
      return null;
    }
  }
  const folderId = `${source}:${inferred.project}`;

  return {
    file: filePath,
    project: inferred.project,
    projectName: inferred.projectName,
    sessionId: path.basename(filePath, path.extname(filePath)),
    title: titleFromContent(filePath, content),
    cwd: inferred.cwd || path.dirname(filePath),
    firstPrompt: firstPromptFromContent(content),
    ts: stat.mtime.toISOString(),
    size: stat.size,
    isSubagent: /subagent|worker|explorer/i.test(filePath),
    folderId,
    source,
  };
}

function collectSessions(): SessionSummary[] {
  if (sessionsCache && Date.now() - sessionsCache.ts < SESSIONS_CACHE_TTL_MS) {
    return sessionsCache.sessions;
  }
  const files = ROOTS.flatMap((root) => walkFiles(root));
  const dedupedFiles = Array.from(new Set(files));
  const sessions = dedupedFiles.map(toSession).filter((entry): entry is SessionSummary => Boolean(entry));
  sessions.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const capped = sessions.slice(0, 600);
  sessionsCache = { ts: Date.now(), sessions: capped };
  return capped;
}

function projectRows(sessions: SessionSummary[]): ProjectSummary[] {
  const grouped = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    const key = `${session.source}:${session.project}`;
    const current = grouped.get(key) || [];
    current.push(session);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries()).map(([id, items]) => ({
    id,
    name: items[0]?.projectName || id,
    folderIds: Array.from(new Set(items.map((item) => item.folderId))),
    fileCount: items.length,
    sessionCount: items.length,
    activeCount: items.filter((item) => Date.now() - new Date(item.ts).getTime() < 24 * 60 * 60 * 1000).length,
  }));
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null;
}

function toRole(value: unknown): "user" | "assistant" | null {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("user")) return "user";
  if (normalized.includes("assistant")) return "assistant";
  if (normalized.includes("system") || normalized.includes("developer")) return null;
  return null;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function pushUnique(values: string[], value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return;
  if (values[values.length - 1] === normalized) return;
  values.push(normalized);
}

function appendTextParts(value: unknown, parts: string[], depth = 0): void {
  if (depth > 5 || value == null) return;

  if (typeof value === "string") {
    pushUnique(parts, value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) appendTextParts(item, parts, depth + 1);
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  const type = String(record.type || "").toLowerCase();
  if (type === "text" || type === "input_text" || type === "output_text") {
    if (typeof record.text === "string") {
      pushUnique(parts, record.text);
    }
    return;
  }

  if (type === "tool_use") {
    return;
  }

  if (type === "tool_result") {
    return;
  }

  if (typeof record.text === "string") {
    pushUnique(parts, record.text);
  }

  if ("content" in record) appendTextParts(record.content, parts, depth + 1);
  if ("message" in record) appendTextParts(record.message, parts, depth + 1);
  if ("payload" in record) appendTextParts(record.payload, parts, depth + 1);
}

function isTranscriptNoise(text: string) {
  const normalized = text.toLowerCase();
  return (
    normalized.startsWith("{\"timestamp\":") ||
    normalized.includes("\"type\":\"function_call_output\"") ||
    normalized.includes("\"type\":\"custom_tool_call_output\"") ||
    normalized.startsWith("# agents.md instructions") ||
    normalized.includes("<environment_context>") ||
    normalized.includes("<permissions instructions>") ||
    normalized.includes("<app-context>") ||
    normalized.includes("<collaboration_mode>") ||
    normalized.includes("approved command prefixes") ||
    normalized.includes("filesystem sandboxing defines") ||
    normalized.includes("launching skill:") ||
    normalized.includes("base directory for this skill:")
  );
}

function finalizeMessage(role: "user" | "assistant", ts: string | null, parts: string[]): ConversationMessage | null {
  const text = normalizeWhitespace(parts.join("\n\n"));
  if (!text || isTranscriptNoise(text)) return null;
  const clipped = text.slice(0, 3000);
  return {
    role,
    text: clipped,
    ts,
    truncated: text.length > clipped.length,
  };
}

function parseClaudeRecord(parsed: Record<string, any>): ConversationMessage[] {
  const recordType = String(parsed.type || "").toLowerCase();
  if (
    recordType === "queue-operation" ||
    recordType === "last-prompt" ||
    recordType === "file-history-snapshot"
  ) {
    return [];
  }

  const attachment = asRecord(parsed.attachment);
  if (attachment) {
    const attachmentType = String(attachment.type || "").toLowerCase();
    if (
      attachmentType.includes("hook") ||
      attachmentType.includes("skill_listing") ||
      attachmentType.includes("deferred_tools_delta")
    ) {
      return [];
    }
  }

  const message = asRecord(parsed.message);
  const role = toRole(parsed.role || parsed.type || message?.role);
  if (!role || !message) return [];

  const parts: string[] = [];
  appendTextParts(message.content, parts);
  const normalized = finalizeMessage(
    role,
    typeof parsed.timestamp === "string" ? parsed.timestamp : null,
    parts,
  );
  return normalized ? [normalized] : [];
}

function parseCodexRecord(parsed: Record<string, any>): ConversationMessage[] {
  const recordType = String(parsed.type || "").toLowerCase();
  if (recordType === "session_meta" || recordType === "turn_context") {
    return [];
  }

  if (recordType === "event_msg") {
    return [];
  }

  if (recordType !== "response_item") {
    return [];
  }

  const payload = asRecord(parsed.payload);
  if (!payload || String(payload.type || "").toLowerCase() !== "message") {
    return [];
  }

  const role = toRole(payload.role);
  if (!role) return [];

  const parts: string[] = [];
  appendTextParts(payload.content, parts);
  const normalized = finalizeMessage(
    role,
    typeof parsed.timestamp === "string" ? parsed.timestamp : null,
    parts,
  );
  return normalized ? [normalized] : [];
}

function parseMessages(content: string): ConversationMessage[] {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const messages: ConversationMessage[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, any>;
        const parsedMessages = parseCodexRecord(record);
        if (parsedMessages.length) {
          messages.push(...parsedMessages);
          continue;
        }

        const claudeMessages = parseClaudeRecord(record);
        if (claudeMessages.length) {
          messages.push(...claudeMessages);
          continue;
        }
      }
      continue;
    } catch {
      // not json, parse below
    }

    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) continue;
    const role = /^user\s*:/i.test(trimmed) ? "user" : "assistant";
    const text = trimmed.replace(/^\w+\s*:/, "").trim();
    if (!text) continue;
    const clipped = text.slice(0, 3000);
    messages.push({ role, text: clipped, ts: null, truncated: text.length > clipped.length });
  }

  return messages.slice(0, 300);
}

export const __conversationParser = {
  parseMessages,
};

export class ClaudeConversationsService {
  static listProjects(source?: SessionSource): ProjectSummary[] {
    const sessions = source ? collectSessions().filter((session) => session.source === source) : collectSessions();
    return projectRows(sessions);
  }

  static listSessions(projectId?: string, source?: SessionSource): SessionSummary[] {
    let sessions = collectSessions();
    if (source) {
      sessions = sessions.filter((session) => session.source === source);
    }
    if (!projectId) return sessions;

    return sessions.filter((session) => session.project === projectId || `${session.source}:${session.project}` === projectId);
  }

  static async *streamMessages(file: string): AsyncGenerator<ConversationMessage> {
    const fullPath = path.resolve(file);
    if (!fs.existsSync(fullPath)) {
      return;
    }

    const content = readTextFile(fullPath);
    for (const message of parseMessages(content)) {
      yield message;
    }
  }
}
