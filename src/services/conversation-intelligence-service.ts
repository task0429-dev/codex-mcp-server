import crypto from "crypto";
import {
  AYUB_OPENROUTER_API_KEY,
  AYUB_OPENROUTER_MODEL_ID,
  DAME_OPENROUTER_API_KEY,
  DAME_OPENROUTER_MODEL_ID,
  OPENROUTER_BASE_URL,
} from "../config";
import { readJsonFile, writeJsonFile } from "../c2/store";
import { getMemoryPool } from "../memory/db";
import { logger } from "../core/logger";
import {
  ClaudeConversationsService,
  ConversationMessage,
  SessionSummary,
} from "./claude-conversations-service";

export type ConversationSource = "claude" | "codex" | "chatgpt" | "c2" | "unknown";
export type ConversationStatus = "planned" | "in_progress" | "blocked" | "completed" | "failed" | "needs_review";

export interface ConversationMemoryRecord {
  id: string;
  sessionKey: string;
  file: string;
  source: ConversationSource;
  title: string;
  rawText: string;
  summary: string;
  executiveSummary: string;
  segmentIds: string[];
  problemsIdentified: string[];
  plansProposed: string[];
  buildTasks: string[];
  codeTasks: string[];
  uiTasks: string[];
  backendTasks: string[];
  automationTasks: string[];
  followUpActions: string[];
  finalStatus: ConversationStatus;
  project: string;
  projectLabel: string;
  repoReferences: string[];
  toolReferences: string[];
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  sourceUpdatedAt: string;
  sourceSize: number;
  segmentCount: number;
  hasBlockers: boolean;
  hasNextSteps: boolean;
  hasCodePlan: boolean;
  hasFailedAttempt: boolean;
  summaryMode: "heuristic" | "llm";
}

export interface ConversationSegmentRecord {
  id: string;
  conversationId: string;
  title: string;
  userRequest: string;
  category: string;
  priority: "high" | "medium" | "low";
  relatedProject: string;
  sourceTool: string;
  problemOrGoal: string;
  assistantResponseSummary: string;
  assistantPlan: string;
  filesOrReposMentioned: string[];
  commandsOrCodeMentioned: string[];
  decisionsMade: string[];
  blockers: string[];
  completedActions: string[];
  failedAttempts: string[];
  nextSteps: string[];
  currentStatus: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  assistantMessages: string[];
  timeline: Array<{ at: string | null; role: string; detail: string }>;
}

export interface MemoryDecisionRecord {
  id: string;
  conversationId: string;
  segmentId: string;
  decision: string;
  reason: string;
  impact: string;
  createdAt: string;
}

export interface MemoryTaskRecord {
  id: string;
  conversationId: string;
  segmentId: string;
  task: string;
  owner: string;
  status: ConversationStatus;
  priority: "high" | "medium" | "low";
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

type ConversationStoreState = {
  version: number;
  updatedAt: string;
  conversations: ConversationMemoryRecord[];
  segments: ConversationSegmentRecord[];
  decisions: MemoryDecisionRecord[];
  tasks: MemoryTaskRecord[];
};

type ConversationListFilters = {
  provider?: ConversationSource;
  project?: string;
  status?: ConversationStatus;
  category?: string;
  priority?: string;
  hasBlockers?: boolean;
  hasNextSteps?: boolean;
  hasCodePlan?: boolean;
  hasFailedAttempt?: boolean;
  from?: string;
  to?: string;
  q?: string;
  agentOrTool?: string;
};

type TimelineEntry = {
  id: string;
  conversationId: string;
  segmentId: string;
  at: string | null;
  type: "segment" | "decision" | "task";
  title: string;
  detail: string;
  status: ConversationStatus;
  project: string;
};

const STORE_FILE = "conversation-intelligence.json";
const EMPTY_STORE: ConversationStoreState = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  conversations: [],
  segments: [],
  decisions: [],
  tasks: [],
};
let storeCache: ConversationStoreState | null = null;

const KNOWN_PROJECTS: Array<{ id: string; label: string; keywords: string[] }> = [
  { id: "c2-command-center", label: "C2 Command Center", keywords: ["c2", "command center", "mission control", "control-ui", "command-center"] },
  { id: "memories-tab", label: "Memories Tab", keywords: ["memories tab", "memory tab", "conversation intelligence", "structured summaries"] },
  { id: "logs-tab", label: "Logs Tab", keywords: ["logs tab", "memoryuse", "logs page"] },
  { id: "agents-tab", label: "Agents Tab", keywords: ["agents tab", "agent ecosystem", "agent page"] },
  { id: "mcp-backend", label: "MCP Backend", keywords: ["mcp backend", "mcp server", "tool registry", "protocols"] },
  { id: "codex-mcp-server", label: "Codex MCP Server", keywords: ["codex-mcp-server", "sync/repos/codex-mcp-server", "dist/index-http.js"] },
  { id: "claude-cowork", label: "Claude CoWork", keywords: ["claude cowork", "cowork"] },
  { id: "task-enterprise-website", label: "Task Enterprise Website", keywords: ["taskenterprise.tech", "task enterprise website"] },
  { id: "sygma-house-website", label: "Sygma House Website", keywords: ["sygma house"] },
  { id: "tech-rescue", label: "Tech Rescue", keywords: ["tech rescue"] },
  { id: "notion-operations", label: "Notion Operations", keywords: ["notion", "notion operations"] },
  { id: "voice-voip-system", label: "Voice/VoIP System", keywords: ["voice", "voip", "tts", "stt", "elevenlabs"] },
  { id: "uptime-kuma-monitoring", label: "Uptime Kuma Monitoring", keywords: ["uptime kuma", "monitoring"] },
  { id: "agent-model-configuration", label: "Agent Model Configuration", keywords: ["model configuration", "openrouter", "model routing"] },
  { id: "automation-engine", label: "Automation Engine", keywords: ["automation", "cron", "workflow", "n8n"] },
  { id: "lead-revenue-dashboard", label: "Lead/Revenue Dashboard", keywords: ["lead", "revenue", "crm", "dashboard"] },
];

function isProcessableConversationFile(file: string) {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (normalized.endsWith("/sessions-index.json")) return false;
  if (normalized.endsWith("/session-index.json")) return false;
  return true;
}

function hashId(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function tokenize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_:\-./\s]/g, " ").split(/\s+/).filter(Boolean);
}

function embedText(input: string, dimensions = 64) {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokenize(input)) {
    const hash = crypto.createHash("sha256").update(token).digest();
    for (let i = 0; i < dimensions; i += 1) {
      const byte = hash[i % hash.length];
      vector[i] += (byte / 255) * (i % 2 === 0 ? 1 : -1);
    }
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftMag = 0;
  let rightMag = 0;
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    dot += left[i] * right[i];
    leftMag += left[i] * left[i];
    rightMag += right[i] * right[i];
  }
  if (!leftMag || !rightMag) return 0;
  return dot / (Math.sqrt(leftMag) * Math.sqrt(rightMag));
}

function nowIso() {
  return new Date().toISOString();
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function compactText(value: string, max = 280) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

function joinUnique(parts: string[]) {
  return unique(parts.map((entry) => entry.trim()).filter(Boolean));
}

function readStore(): ConversationStoreState {
  if (storeCache) return storeCache;
  storeCache = readJsonFile<ConversationStoreState>(STORE_FILE, EMPTY_STORE);
  return storeCache;
}

function writeStore(store: ConversationStoreState) {
  storeCache = { ...store, updatedAt: nowIso() };
  writeJsonFile(STORE_FILE, storeCache);
}

function stripFence(value: string) {
  return value.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function normalizeCategory(text: string) {
  const lower = text.toLowerCase();
  if (/(docker|wsl|infra|deployment|server|monitor|uptime|network|port|proxy|container)/.test(lower)) return "infrastructure";
  if (/(ui|frontend|design|page|tab|react|css|layout|component)/.test(lower)) return "ui";
  if (/(backend|api|route|service|database|schema|express|json)/.test(lower)) return "backend";
  if (/(automation|workflow|cron|n8n|pipeline)/.test(lower)) return "automation";
  if (/(memory|conversation|summary|segment|search)/.test(lower)) return "memory";
  if (/(agent|model|prompt|codex|claude|openrouter)/.test(lower)) return "agents";
  if (/(docs|documentation|notion)/.test(lower)) return "documentation";
  return "general";
}

function normalizePriority(text: string) {
  const lower = text.toLowerCase();
  if (/(urgent|broken|not working|fix it|asap|blocked|error|failed|nothing is working)/.test(lower)) return "high" as const;
  if (/(improve|upgrade|refactor|build|implement)/.test(lower)) return "medium" as const;
  return "low" as const;
}

function extractCommands(text: string) {
  const results = new Set<string>();
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const candidate = match[1].trim();
    if (candidate && (candidate.includes(" ") || candidate.includes("/") || candidate.includes("\\"))) {
      results.add(candidate);
    }
  }
  return Array.from(results).slice(0, 12);
}

function extractFilesAndRepos(text: string) {
  const results = new Set<string>();
  for (const match of text.matchAll(/([A-Za-z]:\\[^\s`"']+|\/[A-Za-z0-9._\-\/]+|[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.[A-Za-z0-9_-]+)?)/g)) {
    const candidate = match[1].trim();
    if (candidate.includes("\\") || candidate.includes("/") || /\.(ts|tsx|json|md|yml|yaml|js|mjs|cjs)$/i.test(candidate)) {
      results.add(candidate);
    }
  }
  return Array.from(results).slice(0, 20);
}

function detectProject(text: string, session: SessionSummary) {
  const haystack = `${text}\n${session.project}\n${session.projectName}\n${session.cwd || ""}\n${session.file}`.toLowerCase();
  const matched = KNOWN_PROJECTS.find((project) => project.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())));
  return matched || { id: session.project || "general", label: session.projectName || session.project || "General", keywords: [] };
}

function splitUserRequests(text: string) {
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned) return [];
  const bulletLines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim());
  if (bulletLines.length >= 2) return bulletLines;
  const sentenceSplits = cleaned.split(/\b(?:also|and also|separately|another thing|in addition)\b/gi).map((part) => part.trim()).filter(Boolean);
  if (sentenceSplits.length > 1) return sentenceSplits;
  const lineSplits = cleaned.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return lineSplits.length > 1 ? lineSplits : [cleaned];
}

function summarizeAssistantResponses(messages: ConversationMessage[]) {
  const assistantTexts = messages.filter((message) => message.role === "assistant").map((message) => message.text.trim()).filter(Boolean);
  // Short action line: first sentence of first assistant message, stripped of markdown
  const firstAction = assistantTexts[0]
    ? assistantTexts[0]
        .replace(/\*\*|__|`|#+\s/g, "")
        .split(/[.\n]/)[0]
        .trim()
        .slice(0, 140)
    : "";
  return {
    full: assistantTexts,
    summary: compactText(assistantTexts.join(" ").trim(), 320),
    firstAction,
    plan: assistantTexts.filter((entry) => /(plan|i'm going to|i will|next|step|build|implement|check|verify|bring|switch|update|add|create|run)/i.test(entry)).slice(0, 8),
  };
}

function extractListBySignal(messages: string[], signal: RegExp, trimTo = 12) {
  return messages.filter((entry) => signal.test(entry)).map((entry) => compactText(entry, 220)).slice(0, trimTo);
}

function deriveStatus(input: {
  userRequest: string;
  assistantPlan: string[];
  blockers: string[];
  completedActions: string[];
  failedAttempts: string[];
  nextSteps: string[];
}) {
  if (input.failedAttempts.length && !input.completedActions.length) return "failed" as const;
  if (input.blockers.length) return "blocked" as const;
  if (input.completedActions.length && !input.nextSteps.length) return "completed" as const;
  if (input.completedActions.length && input.nextSteps.length) return "in_progress" as const;
  if (input.assistantPlan.length || input.nextSteps.length) return "planned" as const;
  if (/(working on|in progress|continue|follow up)/i.test(input.userRequest)) return "in_progress" as const;
  return "needs_review" as const;
}

function buildTimeline(userRequest: string, assistantMessages: ConversationMessage[]) {
  const timeline: Array<{ at: string | null; role: string; detail: string }> = [{ at: assistantMessages[0]?.ts || null, role: "user", detail: compactText(userRequest, 220) }];
  for (const message of assistantMessages.filter((entry) => entry.role === "assistant").slice(0, 12)) {
    timeline.push({ at: message.ts, role: "assistant", detail: compactText(message.text, 220) });
  }
  return timeline;
}

async function collectConversationMessages(file: string) {
  const messages: ConversationMessage[] = [];
  for await (const message of ClaudeConversationsService.streamMessages(file)) {
    messages.push(message);
  }
  return messages;
}

async function maybeSummarizeWithLlm(input: { session: SessionSummary; messages: ConversationMessage[]; draftSegments: ConversationSegmentRecord[] }) {
  const apiKey = DAME_OPENROUTER_API_KEY || AYUB_OPENROUTER_API_KEY;
  const model = "openai/gpt-4o-mini";
  if (!apiKey || !model) return null;

  const transcript = input.messages.slice(0, 20).map((message) => `${message.role.toUpperCase()}: ${message.text.slice(0, 400)}`).join("\n\n").slice(0, 6000);
  const draft = input.draftSegments.map((segment) => ({
    id: segment.id,
    title: segment.title,
    user_request: segment.userRequest,
    category: segment.category,
    status: segment.currentStatus,
    blockers: segment.blockers,
    next_steps: segment.nextSteps,
  }));

  const prompt = [
    "You are generating operational conversation intelligence for TASK's C2 Memories system.",
    "Return strict JSON only.",
    "Do not invent projects, files, or actions that are not clearly present.",
    "",
    "CRITICAL FRAMING RULES:",
    "- title: A short, clear English topic name (3-7 words) describing what this conversation was ABOUT. Not the first message verbatim. Examples: 'Memories Tab Title Fix', 'Docker WSL Port Setup', 'Revenue Dashboard Build'.",
    "- executive_summary: What the USER needed to accomplish. Written from the user's perspective. E.g. 'Needed to fix memory card titles showing raw prompts instead of readable topics.'",
    "- problems_identified: Issues the USER ran into or reported. NOT what the assistant struggled with. E.g. 'Titles showing raw first prompt text', 'Summaries written from AI perspective'.",
    "- plans_proposed: What was planned or agreed to be built/fixed.",
    "- segment titles: Short plain-English labels for what the user was asking for in that segment.",
    "- assistant_response_summary: What the assistant actually did or delivered.",
    "",
    "Return JSON with this shape:",
    JSON.stringify({
      title: "string — short plain English topic, 3-7 words, no raw prompts",
      executive_summary: "string — user-perspective: what they needed done",
      final_status: "planned|in_progress|blocked|completed|failed|needs_review",
      problems_identified: ["user-reported problems, not AI blockers"],
      plans_proposed: ["string"],
      build_tasks: ["string"],
      code_tasks: ["string"],
      ui_tasks: ["string"],
      backend_tasks: ["string"],
      automation_tasks: ["string"],
      follow_up_actions: ["string"],
      segment_overrides: [{ id: "segment id", title: "short plain English label for what user asked", assistant_response_summary: "what the assistant delivered", assistant_plan: "string", decisions_made: ["string"], blockers: ["string"], completed_actions: ["string"], failed_attempts: ["string"], next_steps: ["string"], status: "planned|in_progress|blocked|completed|failed|needs_review" }],
    }, null, 2),
    "",
    `Session source: ${input.session.source}`,
    `Session project: ${input.session.projectName}`,
    "Draft segments:",
    JSON.stringify(draft, null, 2),
    "",
    "Transcript:",
    transcript,
  ].join("\n");

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1200,
        messages: [
          { role: "system", content: "Return only valid JSON. No prose before or after the JSON object." },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      logger.warn("conversation_llm_summary_failed", { status: response.status });
      return null;
    }
    const payload = await response.json() as any;
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return null;
    return JSON.parse(stripFence(content));
  } catch (error: any) {
    logger.warn("conversation_llm_summary_error", { message: error?.message || String(error) });
    return null;
  }
}

async function mirrorToDatabase(store: ConversationStoreState) {
  const pool = getMemoryPool();
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`create table if not exists conversation_memories (id text primary key, source text not null, title text not null, raw_text text not null, summary text not null, project text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null);`);
    await client.query(`create table if not exists conversation_segments (id text primary key, conversation_id text not null, title text not null, user_request text not null, problem_or_goal text not null, assistant_response_summary text not null, assistant_plan text not null, category text not null, priority text not null, status text not null, blockers jsonb not null default '[]'::jsonb, completed_actions jsonb not null default '[]'::jsonb, failed_attempts jsonb not null default '[]'::jsonb, next_steps jsonb not null default '[]'::jsonb, files_or_repos jsonb not null default '[]'::jsonb, tools_mentioned jsonb not null default '[]'::jsonb, commands_mentioned jsonb not null default '[]'::jsonb, created_at timestamptz not null, updated_at timestamptz not null);`);
    await client.query(`create table if not exists memory_decisions (id text primary key, conversation_id text not null, segment_id text not null, decision text not null, reason text not null, impact text not null, created_at timestamptz not null);`);
    await client.query(`create table if not exists memory_tasks (id text primary key, conversation_id text not null, segment_id text not null, task text not null, owner text not null, status text not null, priority text not null, due_date timestamptz null, created_at timestamptz not null, updated_at timestamptz not null);`);

    for (const conversation of store.conversations) {
      await client.query(`insert into conversation_memories (id, source, title, raw_text, summary, project, status, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (id) do update set source=excluded.source, title=excluded.title, raw_text=excluded.raw_text, summary=excluded.summary, project=excluded.project, status=excluded.status, updated_at=excluded.updated_at`, [conversation.id, conversation.source, conversation.title, conversation.rawText, conversation.summary, conversation.project, conversation.status, conversation.createdAt, conversation.updatedAt]);
    }
    for (const segment of store.segments) {
      await client.query(`insert into conversation_segments (id, conversation_id, title, user_request, problem_or_goal, assistant_response_summary, assistant_plan, category, priority, status, blockers, completed_actions, failed_attempts, next_steps, files_or_repos, tools_mentioned, commands_mentioned, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) on conflict (id) do update set conversation_id=excluded.conversation_id, title=excluded.title, user_request=excluded.user_request, problem_or_goal=excluded.problem_or_goal, assistant_response_summary=excluded.assistant_response_summary, assistant_plan=excluded.assistant_plan, category=excluded.category, priority=excluded.priority, status=excluded.status, blockers=excluded.blockers, completed_actions=excluded.completed_actions, failed_attempts=excluded.failed_attempts, next_steps=excluded.next_steps, files_or_repos=excluded.files_or_repos, tools_mentioned=excluded.tools_mentioned, commands_mentioned=excluded.commands_mentioned, updated_at=excluded.updated_at`, [segment.id, segment.conversationId, segment.title, segment.userRequest, segment.problemOrGoal, segment.assistantResponseSummary, segment.assistantPlan, segment.category, segment.priority, segment.currentStatus, JSON.stringify(segment.blockers), JSON.stringify(segment.completedActions), JSON.stringify(segment.failedAttempts), JSON.stringify(segment.nextSteps), JSON.stringify(segment.filesOrReposMentioned), JSON.stringify(segment.sourceTool ? [segment.sourceTool] : []), JSON.stringify(segment.commandsOrCodeMentioned), segment.createdAt, segment.updatedAt]);
    }
    await client.query("delete from memory_decisions");
    for (const decision of store.decisions) {
      await client.query(`insert into memory_decisions (id, conversation_id, segment_id, decision, reason, impact, created_at) values ($1,$2,$3,$4,$5,$6,$7)`, [decision.id, decision.conversationId, decision.segmentId, decision.decision, decision.reason, decision.impact, decision.createdAt]);
    }
    await client.query("delete from memory_tasks");
    for (const task of store.tasks) {
      await client.query(`insert into memory_tasks (id, conversation_id, segment_id, task, owner, status, priority, due_date, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [task.id, task.conversationId, task.segmentId, task.task, task.owner, task.status, task.priority, task.dueDate, task.createdAt, task.updatedAt]);
    }
    await client.query("commit");
  } catch (error: any) {
    await client.query("rollback").catch(() => undefined);
    logger.warn("conversation_memory_db_mirror_failed", { message: error?.message || String(error) });
  } finally {
    client.release();
  }
}

function deriveHeuristicTitle(session: SessionSummary, segments: ConversationSegmentRecord[]) {
  const isSystemPrompt = (text: string) =>
    /^(you are|you're|your role|your task|\[\$task|as a |act as |<ide_|<task_)/i.test(text.trim());

  // Find first segment whose userRequest is a real user message (not a system/skill prompt)
  const realSegment = segments.find((s) => s.userRequest && !isSystemPrompt(s.userRequest) && s.userRequest.length < 500);
  const raw = realSegment?.userRequest || session.firstPrompt || session.title || session.sessionId;

  // If it's still a system prompt, use project name + first segment title as fallback
  if (isSystemPrompt(raw) && segments.length > 0) {
    const firstSegTitle = segments[0]?.title || "";
    const project = session.projectName || session.project || "";
    const combined = project && firstSegTitle ? `${project}: ${firstSegTitle}` : firstSegTitle || project || raw;
    return compactText(combined, 60);
  }

  // Take first line/clause only
  const clause = raw.split(/\n/)[0].trim().split(/[.!?]/)[0].trim();

  // Strip leading filler words
  const cleaned = clause
    .replace(/^(hey|hi|ok|okay|so|uh|can you|could you|please|i need you to|i need|i want|i'd like|can u)\s+/i, "")
    .replace(/^(to|the|a|an)\s+/i, "")
    .trim();

  const titled = (cleaned || clause || raw).replace(/^(.)/, (c) => c.toUpperCase());
  return compactText(titled, 60);
}

export class ConversationIntelligenceService {
  private static syncInFlight: Promise<ConversationMemoryRecord[]> | null = null;

  static isStoreStale(filters?: { provider?: ConversationSource; project?: string }) {
    const store = readStore();
    let sessions = ClaudeConversationsService.listSessions(
      filters?.project,
      filters?.provider === "claude" || filters?.provider === "codex" ? filters.provider : undefined,
    );
    sessions = sessions.filter((session) => !session.isSubagent && isProcessableConversationFile(session.file));

    if (sessions.length === 0) return false;

    const knownSessionKeys = new Set(
      store.conversations.map((entry) => entry.sessionKey || `${entry.source}:${entry.id}`),
    );

    for (const session of sessions) {
      const sessionKey = `${session.source}:${session.sessionId}`;
      const existing = store.conversations.find((entry) => entry.sessionKey === sessionKey || entry.file === session.file);
      if (!existing) return true;
      if (existing.sourceUpdatedAt !== session.ts || existing.sourceSize !== session.size) return true;
      knownSessionKeys.delete(sessionKey);
    }

    return false;
  }

  static async syncSessions(filters?: { provider?: ConversationSource; project?: string }) {
    let sessions = ClaudeConversationsService.listSessions(filters?.project, filters?.provider === "claude" || filters?.provider === "codex" ? filters.provider : undefined);
    sessions = sessions.filter((session) => !session.isSubagent && isProcessableConversationFile(session.file));
    for (const session of sessions) {
      await this.ensureConversationMemory(session, { preferLlm: false });
    }
    return this.listConversations(filters);
  }

  static async forceSyncAllHeuristic() {
    let sessions = ClaudeConversationsService.listSessions();
    sessions = sessions.filter((session) => !session.isSubagent && isProcessableConversationFile(session.file));
    let updated = 0;
    for (const session of sessions) {
      const result = await this.ensureConversationMemory(session, { preferLlm: false, force: true });
      if (result) updated++;
    }
    return updated;
  }

  static async forceSyncAllLlm() {
    let sessions = ClaudeConversationsService.listSessions();
    sessions = sessions.filter((session) => !session.isSubagent && isProcessableConversationFile(session.file));
    let updated = 0;
    for (const session of sessions) {
      const result = await this.ensureConversationMemory(session, { preferLlm: true, force: true });
      if (result) updated++;
    }
    return updated;
  }

  static queueSync(filters?: { provider?: ConversationSource; project?: string }) {
    if (!this.syncInFlight) {
      this.syncInFlight = this.syncSessions(filters).finally(() => {
        this.syncInFlight = null;
      });
    }
    return this.syncInFlight;
  }

  static listConversations(filters?: ConversationListFilters) {
    const store = readStore();
    const needsSegments = Boolean(filters?.category || filters?.priority || filters?.q);
    const segmentMap = needsSegments
      ? new Map<string, ConversationSegmentRecord[]>(
          store.segments.reduce((map, segment) => {
            const list = map.get(segment.conversationId) || [];
            list.push(segment);
            map.set(segment.conversationId, list);
            return map;
          }, new Map<string, ConversationSegmentRecord[]>())
        )
      : new Map<string, ConversationSegmentRecord[]>();
    return store.conversations.filter((conversation) => {
      if (!isProcessableConversationFile(conversation.file)) return false;
      if (filters?.provider && conversation.source !== filters.provider) return false;
      if (filters?.project && conversation.project !== filters.project) return false;
      if (filters?.status && conversation.status !== filters.status) return false;
      if (filters?.from && conversation.createdAt < filters.from) return false;
      if (filters?.to && conversation.createdAt > filters.to) return false;
      if (filters?.hasBlockers && !conversation.hasBlockers) return false;
      if (filters?.hasNextSteps && !conversation.hasNextSteps) return false;
      if (filters?.hasCodePlan && !conversation.hasCodePlan) return false;
      if (filters?.hasFailedAttempt && !conversation.hasFailedAttempt) return false;
      const conversationSegments = needsSegments ? (segmentMap.get(conversation.id) || []) : [];
      if (filters?.category && !conversationSegments.some((segment) => segment.category === filters.category)) return false;
      if (filters?.priority && !conversationSegments.some((segment) => segment.priority === filters.priority)) return false;
      if (filters?.agentOrTool && !conversation.toolReferences.some((tool) => tool.toLowerCase().includes(filters.agentOrTool!.toLowerCase()))) return false;
      if (filters?.q) {
        const haystack = [conversation.title, conversation.summary, conversation.executiveSummary, conversation.rawText, conversation.projectLabel, ...conversationSegments.flatMap((segment) => [segment.title, segment.userRequest, segment.problemOrGoal, segment.assistantPlan, ...segment.blockers, ...segment.nextSteps])].join("\n").toLowerCase();
        if (!haystack.includes(filters.q.toLowerCase())) return false;
      }
      return true;
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  static getConversation(conversationId: string) {
    const store = readStore();
    const conversation = store.conversations.find((entry) => entry.id === conversationId);
    if (!conversation) return null;
    return { conversation, segments: store.segments.filter((segment) => segment.conversationId === conversation.id), decisions: store.decisions.filter((decision) => decision.conversationId === conversation.id), tasks: store.tasks.filter((task) => task.conversationId === conversation.id) };
  }

  static getSegments(conversationId: string) {
    return readStore().segments.filter((segment) => segment.conversationId === conversationId);
  }

  static async regenerateSummary(conversationId: string) {
    const store = readStore();
    const conversation = store.conversations.find((entry) => entry.id === conversationId);
    if (!conversation) return null;
    const session = ClaudeConversationsService.listSessions().find((entry) => `${entry.source}:${entry.sessionId}` === conversation.sessionKey || entry.file === conversation.file);
    if (!session) return null;
    return this.ensureConversationMemory(session, { preferLlm: true, force: true });
  }

  static async reprocessConversation(file: string) {
    const session = ClaudeConversationsService.listSessions().find((entry) => entry.file === file);
    if (!session) return null;
    return this.ensureConversationMemory(session, { preferLlm: true, force: true });
  }

  static async reprocessConversationHeuristic(file: string) {
    const session = ClaudeConversationsService.listSessions().find((entry) => entry.file === file);
    if (!session) return null;
    return this.ensureConversationMemory(session, { preferLlm: false, force: true });
  }

  static async patchSegmentStatus(segmentId: string, status: ConversationStatus) {
    const store = readStore();
    const segment = store.segments.find((entry) => entry.id === segmentId);
    if (!segment) return null;
    segment.currentStatus = status;
    segment.updatedAt = nowIso();
    const conversation = store.conversations.find((entry) => entry.id === segment.conversationId);
    if (conversation) {
      conversation.status = this.rollupConversationStatus(store.segments.filter((entry) => entry.conversationId === conversation.id));
      conversation.updatedAt = nowIso();
    }
    writeStore(store);
    await mirrorToDatabase(store);
    return segment;
  }

  static async addTask(segmentId: string, task: string, owner = "TASK") {
    const store = readStore();
    const segment = store.segments.find((entry) => entry.id === segmentId);
    if (!segment) return null;
    const record: MemoryTaskRecord = { id: hashId(`${segmentId}:${task}:${Date.now()}`), conversationId: segment.conversationId, segmentId, task, owner, status: "planned", priority: segment.priority, dueDate: null, createdAt: nowIso(), updatedAt: nowIso() };
    store.tasks.push(record);
    writeStore(store);
    await mirrorToDatabase(store);
    return record;
  }

  static async linkProject(segmentId: string, project: string) {
    const store = readStore();
    const segment = store.segments.find((entry) => entry.id === segmentId);
    if (!segment) return null;
    segment.relatedProject = project;
    segment.updatedAt = nowIso();
    const conversation = store.conversations.find((entry) => entry.id === segment.conversationId);
    if (conversation) {
      const matched = KNOWN_PROJECTS.find((entry) => entry.id === project);
      conversation.project = project;
      conversation.projectLabel = matched?.label || project;
      conversation.updatedAt = nowIso();
    }
    writeStore(store);
    await mirrorToDatabase(store);
    return segment;
  }

  static searchMemories(query: string, filters?: Partial<ConversationListFilters>) {
    const conversations = this.listConversations({ ...filters, q: undefined });
    const queryVector = embedText(query || "");
    return conversations.map((conversation) => {
      const haystack = [conversation.title, conversation.summary, conversation.executiveSummary, conversation.rawText, conversation.projectLabel].join("\n");
      const keyword = tokenize(query).reduce((score, token) => score + (haystack.toLowerCase().includes(token) ? 1 : 0), 0);
      const semantic = query ? cosineSimilarity(embedText(haystack), queryVector) : 0;
      return { conversation, relevance: Number((keyword * 0.7 + semantic * 0.3).toFixed(4)) };
    }).filter((entry) => !query || entry.relevance > 0).sort((left, right) => right.relevance - left.relevance || right.conversation.createdAt.localeCompare(left.conversation.createdAt));
  }

  static timeline(project?: string) {
    const store = readStore();
    const entries: TimelineEntry[] = [];
    for (const segment of store.segments) {
      const conversation = store.conversations.find((entry) => entry.id === segment.conversationId);
      if (!conversation) continue;
      if (project && conversation.project !== project && segment.relatedProject !== project) continue;
      entries.push({ id: segment.id, conversationId: conversation.id, segmentId: segment.id, at: segment.createdAt, type: "segment", title: segment.title, detail: segment.problemOrGoal, status: segment.currentStatus, project: segment.relatedProject || conversation.project });
    }
    for (const decision of store.decisions) {
      const conversation = store.conversations.find((entry) => entry.id === decision.conversationId);
      if (!conversation || (project && conversation.project !== project)) continue;
      entries.push({ id: decision.id, conversationId: conversation.id, segmentId: decision.segmentId, at: decision.createdAt, type: "decision", title: "Decision", detail: decision.decision, status: conversation.status, project: conversation.project });
    }
    for (const task of store.tasks) {
      const conversation = store.conversations.find((entry) => entry.id === task.conversationId);
      if (!conversation || (project && conversation.project !== project)) continue;
      entries.push({ id: task.id, conversationId: conversation.id, segmentId: task.segmentId, at: task.updatedAt, type: "task", title: task.task, detail: `${task.owner} · ${task.priority}`, status: task.status, project: conversation.project });
    }
    return entries.sort((left, right) => String(right.at || "").localeCompare(String(left.at || "")));
  }

  private static rollupConversationStatus(segments: ConversationSegmentRecord[]) {
    if (segments.some((segment) => segment.currentStatus === "blocked")) return "blocked" as const;
    if (segments.some((segment) => segment.currentStatus === "failed")) return "failed" as const;
    if (segments.length && segments.every((segment) => segment.currentStatus === "completed")) return "completed" as const;
    if (segments.some((segment) => segment.currentStatus === "in_progress")) return "in_progress" as const;
    if (segments.some((segment) => segment.currentStatus === "planned")) return "planned" as const;
    return "needs_review" as const;
  }

  private static async ensureConversationMemory(session: SessionSummary, options?: { preferLlm?: boolean; force?: boolean }) {
    if (!isProcessableConversationFile(session.file)) return null;
    const store = readStore();
    const existing = store.conversations.find((entry) => entry.sessionKey === `${session.source}:${session.sessionId}` || entry.file === session.file);
    if (existing && !options?.force && existing.sourceUpdatedAt === session.ts && existing.sourceSize === session.size) return existing;
    const messages = await collectConversationMessages(session.file);
    if (!messages.length) return existing || null;

    const grouped: Array<{ userText: string; userTs: string | null; assistantMessages: ConversationMessage[] }> = [];
    let current: { userText: string; userTs: string | null; assistantMessages: ConversationMessage[] } | null = null;
    for (const message of messages) {
      if (message.role === "user") {
        if (current) grouped.push(current);
        current = { userText: message.text, userTs: message.ts, assistantMessages: [] };
      } else if (current) {
        current.assistantMessages.push(message);
      }
    }
    if (current) grouped.push(current);

    const project = detectProject(messages.map((entry) => entry.text).join("\n"), session);
    const conversationId = hashId(`${session.source}:${session.sessionId}`);
    const draftSegments: ConversationSegmentRecord[] = [];
    const draftDecisions: MemoryDecisionRecord[] = [];
    const draftTasks: MemoryTaskRecord[] = [];

    grouped.forEach((group, groupIndex) => {
      const assistant = summarizeAssistantResponses(group.assistantMessages);
      splitUserRequests(group.userText).forEach((request, requestIndex) => {
        const segmentId = hashId(`${session.source}:${session.sessionId}:${groupIndex}:${requestIndex}:${request}`);
        const files = joinUnique([...extractFilesAndRepos(request), ...assistant.full.flatMap((entry) => extractFilesAndRepos(entry))]);
        const commands = joinUnique([...extractCommands(request), ...assistant.full.flatMap((entry) => extractCommands(entry))]);
        const blockers = extractListBySignal(assistant.full, /(block|unable|cannot|can't|refused|error|issue|problem|stuck|still broken)/i, 8).filter((s) => s.length < 180);
        const completedActions = extractListBySignal(assistant.full, /(completed|done|verified|fixed|implemented|added|updated|built|restored|running|up)/i, 8).filter((s) => s.length < 180);
        const failedAttempts = extractListBySignal(assistant.full, /(failed|didn't work|did not work|error|refused|timed out|unreachable)/i, 8).filter((s) => s.length < 180);
        const nextSteps = extractListBySignal(assistant.plan, /(next|then|after that|follow up|refresh|recheck|verify|test|run|open)/i, 8);
        const decisions = extractListBySignal(assistant.full, /(i'm switching|we'll use|using|route through|keeping|moving to|decision|recommend)/i, 6);
        const assistantPlan = joinUnique(assistant.plan.map((entry) => compactText(entry, 220)));
        const segmentTitle = (() => {
          const clause = request.split(/\n/)[0].trim().split(/[.!?]/)[0].trim();
          const cleaned = clause
            .replace(/^(hey|hi|ok|okay|so|uh|can you|could you|please|i need you to|i need|i want|i'd like|can u)\s+/i, "")
            .replace(/^(to|the|a|an)\s+/i, "")
            .trim();
          const t = (cleaned || clause || request).replace(/^(.)/, (c) => c.toUpperCase());
          return t.length > 72 ? `${t.slice(0, 71).trimEnd()}…` : t;
        })();
        const segment: ConversationSegmentRecord = {
          id: segmentId,
          conversationId,
          title: segmentTitle,
          userRequest: request,
          category: normalizeCategory(`${request}\n${assistant.summary}`),
          priority: normalizePriority(request),
          relatedProject: project.id,
          sourceTool: session.source === "claude" ? "Claude" : session.source === "codex" ? "Codex" : "Unknown",
          problemOrGoal: compactText(request, 240),
          assistantResponseSummary: assistant.firstAction || assistant.summary,
          assistantPlan: assistantPlan.join("\n"),
          filesOrReposMentioned: files,
          commandsOrCodeMentioned: commands,
          decisionsMade: decisions,
          blockers,
          completedActions,
          failedAttempts,
          nextSteps,
          currentStatus: deriveStatus({ userRequest: request, assistantPlan, blockers, completedActions, failedAttempts, nextSteps }),
          createdAt: group.userTs || session.ts,
          updatedAt: nowIso(),
          assistantMessages: [],
          timeline: buildTimeline(request, group.assistantMessages),
        };
        draftSegments.push(segment);
        for (const decision of decisions) {
          draftDecisions.push({ id: hashId(`${segment.id}:${decision}`), conversationId, segmentId: segment.id, decision: compactText(decision, 220), reason: assistant.summary || "Derived from assistant response.", impact: compactText(segment.problemOrGoal, 180), createdAt: segment.createdAt });
        }
        for (const nextStep of nextSteps.slice(0, 4)) {
          draftTasks.push({ id: hashId(`${segment.id}:${nextStep}`), conversationId, segmentId: segment.id, task: nextStep, owner: "TASK", status: segment.currentStatus === "completed" ? "completed" : "planned", priority: segment.priority, dueDate: null, createdAt: segment.createdAt, updatedAt: nowIso() });
        }
      });
    });

    const llmSummary = options?.preferLlm ? await maybeSummarizeWithLlm({ session, messages, draftSegments }) : null;
    if (llmSummary?.segment_overrides) {
      for (const override of llmSummary.segment_overrides) {
        const segment = draftSegments.find((entry) => entry.id === override.id);
        if (!segment) continue;
        if (typeof override.title === "string" && override.title.trim()) segment.title = compactText(override.title, 90);
        if (typeof override.assistant_response_summary === "string") segment.assistantResponseSummary = compactText(override.assistant_response_summary, 320);
        if (typeof override.assistant_plan === "string") segment.assistantPlan = override.assistant_plan.trim();
        segment.decisionsMade = joinUnique(Array.isArray(override.decisions_made) ? override.decisions_made : segment.decisionsMade);
        segment.blockers = joinUnique(Array.isArray(override.blockers) ? override.blockers : segment.blockers);
        segment.completedActions = joinUnique(Array.isArray(override.completed_actions) ? override.completed_actions : segment.completedActions);
        segment.failedAttempts = joinUnique(Array.isArray(override.failed_attempts) ? override.failed_attempts : segment.failedAttempts);
        segment.nextSteps = joinUnique(Array.isArray(override.next_steps) ? override.next_steps : segment.nextSteps);
        if (typeof override.status === "string") segment.currentStatus = override.status;
      }
    }

    const record: ConversationMemoryRecord = {
      id: conversationId,
      sessionKey: `${session.source}:${session.sessionId}`,
      file: session.file,
      source: session.source,
      title: (() => {
        if (llmSummary?.title && typeof llmSummary.title === "string" && llmSummary.title.trim().length > 2) {
          return compactText(llmSummary.title.trim(), 60);
        }
        // Derive from executive_summary: take first clause
        if (llmSummary?.executive_summary) {
          const clause = llmSummary.executive_summary.split(/[.!\n]/)[0].trim()
            .replace(/^(task enterprise|task|the user needed|needed to|user requested|user asked)\s+/i, "")
            .trim();
          if (clause && clause.length > 4 && clause.length < 80) return compactText(clause, 60);
        }
        return deriveHeuristicTitle(session, draftSegments);
      })(),
      rawText: "",
      summary: compactText(draftSegments.map((s) => s.title).filter(Boolean).join(" · "), 560),
      executiveSummary: llmSummary?.executive_summary || compactText(
        `${draftSegments[0]?.title || session.title || "Conversation"}${draftSegments.length > 1 ? `. ${draftSegments.length} topics covered.` : ""}`,
        420,
      ),
      segmentIds: draftSegments.map((segment) => segment.id),
      problemsIdentified: llmSummary?.problems_identified || joinUnique(
        draftSegments
          .filter((s) => /fix|broken|not working|error|issue|fail|can't|cannot|doesn't|won't|unable/i.test(s.userRequest))
          .map((s) => s.title)
      ).slice(0, 6),
      plansProposed: llmSummary?.plans_proposed || joinUnique(draftSegments.flatMap((segment) => segment.assistantPlan.split("\n"))).slice(0, 12),
      buildTasks: llmSummary?.build_tasks || joinUnique(draftSegments.filter((segment) => /build|implement|create|upgrade/i.test(segment.userRequest)).map((segment) => segment.title)).slice(0, 12),
      codeTasks: llmSummary?.code_tasks || joinUnique(draftSegments.filter((segment) => /code|repo|file|route|service|api/i.test(segment.userRequest)).map((segment) => segment.title)).slice(0, 12),
      uiTasks: llmSummary?.ui_tasks || joinUnique(draftSegments.filter((segment) => segment.category === "ui").map((segment) => segment.title)).slice(0, 12),
      backendTasks: llmSummary?.backend_tasks || joinUnique(draftSegments.filter((segment) => segment.category === "backend").map((segment) => segment.title)).slice(0, 12),
      automationTasks: llmSummary?.automation_tasks || joinUnique(draftSegments.filter((segment) => segment.category === "automation").map((segment) => segment.title)).slice(0, 12),
      followUpActions: llmSummary?.follow_up_actions || joinUnique(draftSegments.flatMap((segment) => segment.nextSteps)).slice(0, 12),
      finalStatus: llmSummary?.final_status || this.rollupConversationStatus(draftSegments),
      project: project.id,
      projectLabel: project.label,
      repoReferences: joinUnique(draftSegments.flatMap((segment) => segment.filesOrReposMentioned)).slice(0, 18),
      toolReferences: joinUnique(draftSegments.flatMap((segment) => {
        const refs = [segment.sourceTool];
        if (segment.userRequest.toLowerCase().includes("docker")) refs.push("Docker");
        if (segment.userRequest.toLowerCase().includes("wsl")) refs.push("WSL");
        if (segment.userRequest.toLowerCase().includes("notion")) refs.push("Notion");
        if (segment.userRequest.toLowerCase().includes("openrouter")) refs.push("OpenRouter");
        return refs;
      })),
      status: llmSummary?.final_status || this.rollupConversationStatus(draftSegments),
      createdAt: existing?.createdAt || session.ts,
      updatedAt: nowIso(),
      sourceUpdatedAt: session.ts,
      sourceSize: session.size,
      segmentCount: draftSegments.length,
      hasBlockers: draftSegments.some((segment) => segment.blockers.length > 0),
      hasNextSteps: draftSegments.some((segment) => segment.nextSteps.length > 0),
      hasCodePlan: draftSegments.some((segment) => segment.commandsOrCodeMentioned.length > 0 || segment.category === "backend" || segment.category === "ui"),
      hasFailedAttempt: draftSegments.some((segment) => segment.failedAttempts.length > 0),
      summaryMode: llmSummary ? "llm" : "heuristic",
    };

    const nextStore: ConversationStoreState = { ...store, conversations: store.conversations.filter((entry) => entry.id !== record.id).concat(record), segments: store.segments.filter((entry) => entry.conversationId !== record.id).concat(draftSegments), decisions: store.decisions.filter((entry) => entry.conversationId !== record.id).concat(draftDecisions), tasks: store.tasks.filter((entry) => entry.conversationId !== record.id).concat(draftTasks), updatedAt: nowIso() };
    writeStore(nextStore);
    await mirrorToDatabase(nextStore);
    return record;
  }
}
