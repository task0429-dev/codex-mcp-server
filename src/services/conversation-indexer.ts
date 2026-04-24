// src/services/conversation-indexer.ts
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import os from "os";

export interface SessionIndex {
  title: string;
  primaryTopic: string;
  topics: string[];
  project: string;
  indexedAt: string | null;
  fileSize: number;
}

export interface ConversationIndex {
  version: number;
  updatedAt: string;
  topicColors: Record<string, string>;
  sessions: Record<string, SessionIndex>;
}

const PALETTE = ["red", "blue", "green", "purple", "amber", "teal", "rose", "indigo"] as const;
type Color = typeof PALETTE[number];

const SIMILAR_PAIRS: Record<string, string[]> = {
  red: ["rose"],
  rose: ["red"],
  blue: ["indigo"],
  indigo: ["blue"],
  green: ["teal"],
  teal: ["green"],
};

export function assignColor(
  newTopic: string,
  topicColors: Record<string, string>,
  existingCardColors: string[]
): Color {
  if (topicColors[newTopic]) return topicColors[newTopic] as Color;

  const forbidden = new Set<string>();
  for (const c of existingCardColors) {
    forbidden.add(c);
    for (const similar of SIMILAR_PAIRS[c] || []) {
      forbidden.add(similar);
    }
  }

  const usageCounts: Record<string, number> = {};
  for (const c of PALETTE) usageCounts[c] = 0;
  for (const c of Object.values(topicColors)) {
    if (usageCounts[c] !== undefined) usageCounts[c]++;
  }

  const available = PALETTE.filter(c => !forbidden.has(c));
  const candidates = available.length > 0 ? available : [...PALETTE];
  candidates.sort((a, b) => usageCounts[a] - usageCounts[b]);
  return candidates[0];
}

const INDEX_PATH = path.resolve(process.cwd(), "data/conversation-index.json");

export function readIndex(): ConversationIndex {
  try {
    const raw = fs.readFileSync(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed;
  } catch {
    // File missing or corrupt — start fresh
  }
  return { version: 1, updatedAt: new Date().toISOString(), topicColors: {}, sessions: {} };
}

export function writeIndex(index: ConversationIndex): void {
  const tmp = INDEX_PATH + ".tmp";
  index.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2), "utf8");
  fs.renameSync(tmp, INDEX_PATH);
}

const HEAD_BYTES = 12_288;
const MAX_EXCERPT_CHARS = 6_000;

export function extractUserMessages(filePath: string): string {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(HEAD_BYTES);
  const bytesRead = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
  fs.closeSync(fd);

  const chunk = buf.slice(0, bytesRead).toString("utf8");
  const lines = chunk.split("\n").filter(Boolean);
  if (lines.length > 1) lines.pop();

  const texts: string[] = [];
  let totalChars = 0;

  for (const line of lines) {
    if (totalChars >= MAX_EXCERPT_CHARS) break;
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "user") continue;
      const content = entry.message?.content;
      if (typeof content === "string" && content.length > 0 && !content.startsWith("<")) {
        const snippet = content.slice(0, MAX_EXCERPT_CHARS - totalChars);
        texts.push(snippet);
        totalChars += snippet.length;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type === "text" && typeof part.text === "string" && !part.text.startsWith("<")) {
            const snippet = part.text.slice(0, MAX_EXCERPT_CHARS - totalChars);
            texts.push(snippet);
            totalChars += snippet.length;
            if (totalChars >= MAX_EXCERPT_CHARS) break;
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return texts.join("\n\n");
}

const OPENROUTER_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

const INDEXER_API_KEY = () =>
  process.env.ABDI_OPENROUTER_API_KEY ||
  process.env.PRIME_OPENROUTER_API_KEY ||
  "";

interface AnalysisResult {
  title: string;
  primaryTopic: string;
  topics: string[];
}

export async function analyzeSession(excerpt: string): Promise<AnalysisResult | null> {
  const apiKey = INDEXER_API_KEY();
  if (!apiKey || !excerpt.trim()) return null;

  const prompt = `Given these conversation excerpts, return valid JSON only (no markdown, no explanation):
{
  "title": "5-8 words, specific to what was actually done",
  "primaryTopic": "2-3 words",
  "topics": ["array of 2-4 strings, each 2-4 words, distinct activities — no generic labels like discussion or help"]
}

Excerpts:
${excerpt}`;

  try {
    const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as any;
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as AnalysisResult;
    if (typeof parsed.title !== "string" || !Array.isArray(parsed.topics)) return null;
    return {
      title: parsed.title.slice(0, 80),
      primaryTopic: (parsed.primaryTopic || parsed.topics[0] || "General").slice(0, 40),
      topics: parsed.topics.slice(0, 4).map((t: string) => String(t).slice(0, 40)),
    };
  } catch {
    return null;
  }
}

const CLAUDE_PROJECTS_DIR = () =>
  process.env.CLAUDE_PROJECTS_DIR ||
  path.join(os.homedir(), ".claude", "projects");

function scanJsonlFiles(projectsDir: string): { sessionId: string; filePath: string; project: string; size: number }[] {
  const results: { sessionId: string; filePath: string; project: string; size: number }[] = [];
  try {
    const folders = fs.readdirSync(projectsDir);
    for (const folder of folders) {
      const folderPath = path.join(projectsDir, folder);
      try {
        if (!fs.statSync(folderPath).isDirectory()) continue;
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;
          const filePath = path.join(folderPath, file);
          try {
            const size = fs.statSync(filePath).size;
            results.push({ sessionId: file.replace(/\.jsonl$/, ""), filePath, project: folder, size });
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
  } catch { /* projects dir missing */ }
  return results;
}

export class ConversationIndexer extends EventEmitter {
  private index: ConversationIndex;
  private queue: { sessionId: string; filePath: string; project: string; size: number }[] = [];
  private analyzing = 0;
  private readonly CONCURRENCY = 3;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.index = readIndex();
  }

  getStatus() {
    return {
      indexed: Object.values(this.index.sessions).filter(s => s.indexedAt !== null).length,
      pending: this.queue.length,
      analyzing: this.analyzing,
    };
  }

  getIndex(): ConversationIndex {
    return this.index;
  }

  async startup() {
    const files = scanJsonlFiles(CLAUDE_PROJECTS_DIR());
    for (const f of files) {
      const existing = this.index.sessions[f.sessionId];
      const needsIndex = !existing || existing.indexedAt === null || (f.size - existing.fileSize > 10_240);
      if (needsIndex) this.queue.push(f);
    }
    this._drain();
    this._startWatcher();
  }

  reindex() {
    this.index = { version: 1, updatedAt: new Date().toISOString(), topicColors: {}, sessions: {} };
    writeIndex(this.index);
    this.queue = [];
    this.startup();
  }

  private _startWatcher() {
    const dir = CLAUDE_PROJECTS_DIR();
    try {
      this.watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename || !filename.endsWith(".jsonl")) return;
        const existing = this.debounceTimers.get(filename);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          this.debounceTimers.delete(filename);
          const parts = filename.replace(/\\/g, "/").split("/");
          if (parts.length < 2) return;
          const project = parts[0];
          const sessionId = parts[1].replace(/\.jsonl$/, "");
          const filePath = path.join(dir, filename);
          try {
            const size = fs.statSync(filePath).size;
            const existing = this.index.sessions[sessionId];
            if (!existing || existing.indexedAt === null || (size - existing.fileSize > 10_240)) {
              this.queue.push({ sessionId, filePath, project, size });
              this._drain();
            }
          } catch { /* file removed */ }
        }, 3_000);
        this.debounceTimers.set(filename, timer);
      });
    } catch { /* watcher not supported */ }
  }

  private _drain() {
    while (this.analyzing < this.CONCURRENCY && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.analyzing++;
      this._processOne(item).finally(() => {
        this.analyzing--;
        this._drain();
      });
    }
  }

  private async _processOne(item: { sessionId: string; filePath: string; project: string; size: number }) {
    try {
      const excerpt = extractUserMessages(item.filePath);
      const result = await analyzeSession(excerpt);

      const cardColors: string[] = [];
      const topics = result?.topics || [];
      for (const topic of topics) {
        if (!this.index.topicColors[topic]) {
          this.index.topicColors[topic] = assignColor(topic, this.index.topicColors, cardColors);
        }
        cardColors.push(this.index.topicColors[topic]);
      }

      const sessionData: SessionIndex = {
        title: result?.title || "Untitled",
        primaryTopic: result?.primaryTopic || "Unknown",
        topics,
        project: item.project,
        indexedAt: result ? new Date().toISOString() : null,
        fileSize: item.size,
      };

      this.index.sessions[item.sessionId] = sessionData;
      writeIndex(this.index);
      this.emit("indexed", { sessionId: item.sessionId, data: sessionData, topicColors: this.index.topicColors });
    } catch {
      this.index.sessions[item.sessionId] = {
        title: "Untitled",
        primaryTopic: "Unknown",
        topics: [],
        project: item.project,
        indexedAt: null,
        fileSize: item.size,
      };
      writeIndex(this.index);
    }
  }
}

export const conversationIndexer = new ConversationIndexer();
