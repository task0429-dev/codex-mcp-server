import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { CLAUDE_PROJECTS_DIR, CODEX_ARCHIVED_DIR, CODEX_SESSION_INDEX_PATH, CODEX_SESSIONS_DIR } from "../config/config";

export type ConversationProvider = "claude" | "codex";
export type ConversationRepairStatus = "Done" | "In Progress" | "Blocked" | "Planning";

export interface ConversationRepairRecord {
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

export interface SessionIndex {
  title: string;
  primaryTopic: string;
  topics: string[];
  project: string;
  repair: ConversationRepairRecord;
  indexedAt: string | null;
  fileSize: number;
  provider: ConversationProvider;
  // Optional session-list metadata — populated so remote deployments can serve
  // sessions even when the raw JSONL files aren't mounted in the container.
  sessionId?: string;
  ts?: string | null;
  file?: string;
}

export interface ConversationIndex {
  version: number;
  updatedAt: string;
  topicColors: Record<string, string>;
  sessions: Record<string, SessionIndex>;
}

const INDEX_VERSION = 3;

interface QueuedSession {
  sessionId: string;
  filePath: string;
  project: string;
  size: number;
  provider: ConversationProvider;
}

interface CodexThreadEntry {
  threadName: string | null;
  updatedAt: string | null;
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

export function resolveSessionIndexKey(provider: ConversationProvider, sessionId: string): string {
  return `${provider}:${sessionId}`;
}

export function assignColor(
  newTopic: string,
  topicColors: Record<string, string>,
  existingCardColors: string[]
): Color {
  if (topicColors[newTopic]) return topicColors[newTopic] as Color;

  const forbidden = new Set<string>();
  for (const c of existingCardColors) {
    forbidden.add(c);
    for (const similar of SIMILAR_PAIRS[c] || []) forbidden.add(similar);
  }

  const usageCounts: Record<string, number> = {};
  for (const c of PALETTE) usageCounts[c] = 0;
  for (const c of Object.values(topicColors)) {
    if (usageCounts[c] !== undefined) usageCounts[c]++;
  }

  const available = PALETTE.filter((c) => !forbidden.has(c));
  const candidates = available.length > 0 ? available : [...PALETTE];
  candidates.sort((a, b) => usageCounts[a] - usageCounts[b]);
  return candidates[0];
}

const INDEX_PATH = path.resolve(process.cwd(), "data/conversation-index.json");

export function readIndex(): ConversationIndex {
  try {
    const raw = fs.readFileSync(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const sessions = parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {};
    const hasLegacySessionShape = Object.values(sessions).some((session: any) => !session || typeof session !== "object" || !session.provider || !session.repair);
    if (parsed.version === INDEX_VERSION && !hasLegacySessionShape) return parsed;
  } catch {
    // start fresh
  }
  return { version: INDEX_VERSION, updatedAt: new Date().toISOString(), topicColors: {}, sessions: {} };
}

export function writeIndex(index: ConversationIndex): void {
  const tmp = INDEX_PATH + ".tmp";
  index.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2), "utf8");
  fs.renameSync(tmp, INDEX_PATH);
}

const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","up","about","into","through","during","is","are","was","were","be",
  "been","being","have","has","had","do","does","did","will","would","could",
  "should","may","might","shall","can","need","dare","ought","used","i","you",
  "he","she","it","we","they","me","him","her","us","them","my","your","his",
  "its","our","their","this","that","these","those","what","which","who","how",
  "when","where","why","all","each","every","both","few","more","most","other",
  "some","such","no","not","only","same","so","than","too","very","just","also",
  "get","got","make","made","use","using","want","let","go","going","here","there",
  "then","now","like","well","back","way","even","new","old","first","last","long",
  "great","good","right","work","working","need","sure","re","ve","ll","don","t",
  "can","said","say","s","m","d","ok","okay","yes","no","please","hi","hello",
]);

const TOPIC_BUCKETS: Array<{ label: string; keywords: string[]; weight?: number }> = [
  { label: "CRM & Leads",       keywords: ["crm","lead","leads","contact","contacts","pipeline","sales","acquisition","hubspot","ghl","highlevel"], weight: 3 },
  { label: "Agent System",      keywords: ["agent","agents","subagent","multi-agent","abdi","prime","rex","atlas","ahmed","dame","ayub","sygma","orchestrat"], weight: 3 },
  { label: "MCP Server",        keywords: ["mcp","stdio","transport","protocol","mcp-server","tool-call"], weight: 3 },
  { label: "Memory System",     keywords: ["memory","memories","recall","indexer","conversation","claude-mem","session-index"], weight: 3 },
  { label: "Database",          keywords: ["database","supabase","postgres","mongodb","sql","schema","migration","table","query"], weight: 3 },
  { label: "Docker / Infra",    keywords: ["docker","container","compose","nginx","kubernetes","deploy","deployment","infra"], weight: 3 },
  { label: "Voice & Telegram",  keywords: ["voice","telegram","twilio","call","phone","sms","whatsapp","bot-token"], weight: 3 },
  { label: "Search & Scraping", keywords: ["scrape","scraping","crawl","playwright","puppeteer","cheerio"], weight: 3 },
  { label: "Auth & Security",   keywords: ["auth","authentication","jwt","oauth","credential","login","permission","rbac"], weight: 2 },
  { label: "API Integration",   keywords: ["api","webhook","rest","graphql","openrouter","anthropic","openai","endpoint"], weight: 2 },
  { label: "Automation",        keywords: ["automat","workflow","schedule","cron","trigger","n8n","zapier","make"], weight: 2 },
  { label: "UI / Frontend",     keywords: ["ui","frontend","react","tsx","component","dashboard","modal","css","design","layout","button","tab","page"], weight: 2 },
  { label: "AI Models",         keywords: ["claude","codex","haiku","sonnet","opus","llm","model","prompt","completion","embedding","temperature"], weight: 2 },
  { label: "Git & DevOps",      keywords: ["git","commit","branch","pull request","merge","github","release","ci","cd"], weight: 1 },
  { label: "File & Code",       keywords: ["typescript","javascript","refactor","module","class","function","package","import","export","build","npm"], weight: 1 },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function extractNgrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n).join(" ");
    if (!gram.split(" ").every((w) => STOPWORDS.has(w))) out.push(gram);
  }
  return out;
}

function topN<T>(map: Map<T, number>, n: number): T[] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => typeof p?.text === "string")
      .map((p: any) => p.text as string)
      .join("\n");
  }
  return "";
}

function cleanMessageText(raw: string): string {
  return raw
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "")
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, "")
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "")
    .replace(/<[a-z_-]+>[\s\S]{0,200}<\/[a-z_-]+>/g, "")
    .trim();
}

function extractCodexMessageText(content: any[]): string {
  return content
    .filter((part) => typeof part?.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

function isCodexInstructionBoilerplate(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized.includes("<permissions instructions>")
    || normalized.includes("<app-context>")
    || normalized.includes("<collaboration_mode>")
    || normalized.includes("# plan mode (conversational)")
    || normalized.includes("# agents.md instructions for")
    || normalized.includes("always refer to the human operator as task")
    || normalized.includes("you are codex, an advanced ai software engineer")
    || normalized.includes("<environment_context>");
}

function extractMeaningfulText(raw: string, provider: ConversationProvider): string {
  const text = cleanMessageText(raw);
  if (!text) return "";
  if (provider === "codex" && isCodexInstructionBoilerplate(text)) return "";
  return text;
}

export function extractUserMessages(filePath: string, provider: ConversationProvider = "claude"): string {
  const MAX_USER_MSGS = 30;
  const MAX_ASST_MSGS = 10;
  const MAX_TEXT_PER_MSG = 400;
  const userTexts: string[] = [];
  const asstTexts: string[] = [];
  const fileContent = fs.readFileSync(filePath, "utf8");
  const lines = fileContent.split("\n");

  for (const line of lines) {
    if (userTexts.length >= MAX_USER_MSGS && asstTexts.length >= MAX_ASST_MSGS) break;
    if (!line) continue;

    try {
      const entry = JSON.parse(line);
      if (provider === "claude") {
        const isUser = entry.type === "user";
        const isAsst = entry.type === "assistant";
        if (!isUser && !isAsst) continue;

        const raw = extractTextFromContent(entry.message?.content);
        const text = extractMeaningfulText(raw, "claude");
        if (!text || text.startsWith("<") || text.length < 4) continue;
        if (isUser && Array.isArray(entry.message?.content) && entry.message.content.every((p: any) => p.type === "tool_result")) continue;

        const snippet = text.slice(0, MAX_TEXT_PER_MSG);
        if (isUser && userTexts.length < MAX_USER_MSGS) userTexts.push("USER: " + snippet);
        if (isAsst && asstTexts.length < MAX_ASST_MSGS) asstTexts.push("ASST: " + snippet);
        continue;
      }

      if (entry.type !== "response_item" || entry.payload?.type !== "message") continue;
      const role = entry.payload?.role;
      const content = Array.isArray(entry.payload?.content) ? entry.payload.content : [];
      const text = extractMeaningfulText(extractCodexMessageText(content), "codex");
      if (!text || text.length < 4) continue;

      const snippet = text.slice(0, MAX_TEXT_PER_MSG);
      if (role === "user" && userTexts.length < MAX_USER_MSGS) userTexts.push("USER: " + snippet);
      if (role === "assistant" && asstTexts.length < MAX_ASST_MSGS) asstTexts.push("ASST: " + snippet);
    } catch {
      // skip malformed lines
    }
  }

  return [...userTexts, ...asstTexts].join("\n\n");
}

interface AnalysisResult {
  title: string;
  primaryTopic: string;
  topics: string[];
  repair: ConversationRepairRecord;
}

const ACTION_VERBS = new Set([
  "fix","fixed","fixing","add","added","adding","build","built","building",
  "create","created","creating","implement","implemented","implementing",
  "refactor","refactored","update","updated","updating","migrate","migrated",
  "debug","debugged","rewrite","rewrote","deploy","deployed","setup","configure",
  "configured","integrate","integrated","remove","removed","install","installed",
  "connect","connected","replace","replaced","redesign","redesigned","optimize",
  "optimized","move","moved","extract","extracted","convert","converted",
]);

const GENERIC_STARTERS = [
  /^(this session|the (previous|prior|last) (session|conversation)|summary|overview|i am|i'm|here is|here's|the following|continuing|let me|can you|please|note:|important:)/i,
  /^(the (goal|plan|task|objective) (is|was|of this))/i,
  /^(this (is|was) a|this (document|context|file))/i,
];

function isGenericSentence(s: string): boolean {
  return GENERIC_STARTERS.some((re) => re.test(s.trim()));
}

function cleanInsightLine(raw: string): string {
  return raw
    .replace(/^(USER|ASST):\s*/, "")
    .replace(/^[#>*\-\d.)\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function limitText(text: string, max = 180): string {
  const clean = cleanInsightLine(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "...";
}

function uniqueLines(lines: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines.map((l) => limitText(l)).filter((l) => l.length > 8)) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}

function splitInsightSentences(excerpt: string): Array<{ role: "user" | "assistant"; text: string }> {
  const out: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const para of excerpt.split(/\n\n+/).slice(0, 80)) {
    const role = para.startsWith("USER: ") ? "user" : "assistant";
    const raw = cleanInsightLine(para);
    if (!raw || isGenericSentence(raw)) continue;
    const sentences = raw
      .split(/(?<=[.!?])\s+|\n+/)
      .map(cleanInsightLine)
      .filter((s) => s.length > 14 && s.length < 260 && !isGenericSentence(s));
    for (const sentence of sentences.slice(0, 6)) out.push({ role, text: sentence });
  }
  return out;
}

function pickFirst(sentences: Array<{ role: "user" | "assistant"; text: string }>, pattern: RegExp, role?: "user" | "assistant"): string | null {
  return sentences.find((s) => (!role || s.role === role) && pattern.test(s.text))?.text || null;
}

function inferRepairStatus(excerpt: string, sentences: Array<{ role: "user" | "assistant"; text: string }>): ConversationRepairStatus {
  const haystack = excerpt.toLowerCase();
  const assistantText = sentences.filter((s) => s.role === "assistant").map((s) => s.text.toLowerCase()).join("\n");
  if (/\b(blocked|cannot proceed|can't proceed|waiting for|needs approval|permission denied|missing secret|missing env|unavailable|failed validation|not ready)\b/.test(haystack)) {
    return "Blocked";
  }
  if (/\b(done|fixed|resolved|repaired|implemented|built|added|updated|deployed|validated|verified|tests? passed|build succeeded|production ready)\b/.test(assistantText)) {
    return "Done";
  }
  if (/\b(plan|planning|architecture|brainstorm|proposal|recommendation|option|strategy|design)\b/.test(haystack)
      && !/\b(fix|fixed|build|built|implement|implemented|deploy|deployed|validate|validated)\b/.test(assistantText)) {
    return "Planning";
  }
  return "In Progress";
}

function inferAffectedSystem(excerpt: string, topics: string[], project: string): string {
  const haystack = excerpt.toLowerCase();
  const systems = [
    ["Memories / Conversation Index", /\b(memory|memories|conversation index|session index|archive|transcript)\b/],
    ["C2 Command Center", /\b(c2|command center|mission control|control-ui|agents tab|monitor tab)\b/],
    ["MCP Server", /\b(mcp|model context protocol|tool registry|stdio|http transport)\b/],
    ["Backend / API", /\b(api|route|server|backend|webhook|worker|queue|supabase|postgres|database)\b/],
    ["Frontend / UI", /\b(ui|frontend|page|tab|component|tsx|css|layout|dashboard)\b/],
    ["Deployment / Infrastructure", /\b(deploy|deployment|docker|nginx|cloudflare|vercel|server|container)\b/],
    ["Agent Ecosystem", /\b(agent|agents|abdi|ayub|rex|prime|atlas|ahmed|dame|sygma)\b/],
  ] as const;
  return systems.find(([, re]) => re.test(haystack))?.[0] || topics[0] || project || "General System";
}

function buildRepairRecord(excerpt: string, title: string, topics: string[], project: string): ConversationRepairRecord {
  const sentences = splitInsightSentences(excerpt);
  const userSentences = sentences.filter((s) => s.role === "user");
  const assistantSentences = sentences.filter((s) => s.role === "assistant");
  const problem = pickFirst(sentences, /\b(error|bug|broken|issue|problem|fail|failing|missing|not working|doesn't work|cant|can't|need|want|redo|fix)\b/i, "user")
    || userSentences[0]?.text
    || title;
  const rootCause = pickFirst(sentences, /\b(because|caused by|root cause|turns out|issue is|problem is|missing|failed because|blocked by)\b/i)
    || "Not explicitly captured in the transcript; infer from the repair steps and validation notes.";
  const actionLines = uniqueLines(
    assistantSentences
      .map((s) => s.text)
      .filter((line) => /\b(check|inspect|found|read|updated|added|created|removed|changed|patched|ran|tested|validated|verified|built|deployed|configured|reindexed)\b/i.test(line)),
    6
  );
  const solution = pickFirst(sentences, /\b(fixed|resolved|solution|implemented|built|added|updated|changed|patched|validated|deployed|now)\b/i, "assistant")
    || actionLines[actionLines.length - 1]
    || "Solution details were not explicit; review the raw transcript below for the final applied change.";
  const filesAndTools = uniqueLines(
    excerpt.match(/\b(?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|json|py|md|sql|sh|yaml|yml|css|html)\b|\b(?:PowerShell|Bash|git|npm|node|python|rg|Playwright|Supabase|Vercel|Docker|Cloudflare|Notion|Google Drive|MCP)\b/g) || [],
    8
  );
  const validationEvidence = uniqueLines(
    assistantSentences
      .map((s) => s.text)
      .filter((line) => /\b(test|tests|build|typecheck|lint|validated|verified|passed|failed|screenshot|confirmed|checked)\b/i.test(line)),
    4
  );
  const remainingRisks = uniqueLines(
    sentences
      .map((s) => s.text)
      .filter((line) => /\b(risk|remaining|blocked|not tested|could not|cannot|can't|pending|todo|follow-up|incomplete|not ready)\b/i.test(line)),
    4
  );
  const nextAction = pickFirst(sentences, /\b(next|todo|follow up|remaining|need to|should|approve|deploy|verify)\b/i)
    || (inferRepairStatus(excerpt, sentences) === "Done" ? "No immediate next action captured." : "Continue from the listed steps and resolve the remaining risk.");

  return {
    status: inferRepairStatus(excerpt, sentences),
    mainProblem: limitText(problem),
    rootCause: limitText(rootCause),
    affectedSystem: inferAffectedSystem(excerpt, topics, project),
    stepsTaken: actionLines.length ? actionLines : ["Conversation captured; detailed steps were not explicit in the indexed excerpt."],
    solution: limitText(solution, 220),
    filesAndTools,
    validationEvidence: validationEvidence.length ? validationEvidence : ["No explicit validation evidence captured in the indexed excerpt."],
    remainingRisks: remainingRisks.length ? remainingRisks : ["No explicit remaining risk captured."],
    nextAction: limitText(nextAction),
    summary: limitText(`${title} - ${solution}`, 260),
  };
}

function extractSpecificTerms(text: string): string[] {
  const terms: string[] = [];
  const filePaths = text.match(/\b[\w\-]+\.(?:ts|tsx|js|jsx|json|py|go|md|sql|sh|yaml|yml)\b/g) || [];
  terms.push(...filePaths.slice(0, 5));
  const camelCase = text.match(/\b[A-Z][a-zA-Z]{5,}\b/g) || [];
  terms.push(...camelCase.slice(0, 4));
  const funcNames = text.match(/\b[a-z][a-zA-Z]{3,}(?=\()/g) || [];
  terms.push(...funcNames.slice(0, 3));
  const errors = text.match(/\b(?:HTTP\s+\d{3}|\d{3}\s+error|ENOENT|ECONNREFUSED|TypeError|ReferenceError)\b/gi) || [];
  terms.push(...errors.slice(0, 2));
  return [...new Set(terms)].map((t) => t.replace(/\.[a-z]+$/, ""));
}

export function analyzeSessionLocal(excerpt: string): AnalysisResult {
  const paragraphs = excerpt.split(/\n\n+/);
  let title = "Untitled Session";
  const candidates: Array<{ text: string; score: number }> = [];
  let paraIdx = 0;

  for (const para of paragraphs.slice(0, 40)) {
    paraIdx++;
    const isUserPara = para.startsWith("USER: ");
    const raw = para.replace(/^(USER|ASST):\s*/, "");
    const clean = raw
      .replace(/https?:\/\/\S+/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]+`/g, "")
      .replace(/^[#*>\-_`\s]+/, "")
      .replace(/[-_]{2,}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length < 15 || clean.length > 1000) continue;

    const sentences = clean.split(/(?<=[.!?])\s+|\n/)
      .map((s) => s.replace(/^\s*[-*+]\s*/, "").replace(/\*\*/g, "").replace(/`/g, "").trim())
      .filter((s) => s.length > 12 && s.length < 200);

    for (const sentence of sentences.slice(0, 4)) {
      if (isGenericSentence(sentence)) continue;
      if (/^(Added|Removed|Changed|Updated|Fixed|Modified|Moved|Replaced|Deleted)\s+[`\[<]/.test(sentence)) continue;
      if (/^\[/.test(sentence)) continue;

      const words = sentence.split(/\s+/);
      let score = 0;
      if (isUserPara) score += 8;
      const firstWord = words[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
      if (ACTION_VERBS.has(firstWord)) score += 6;
      if (words.some((w) => ACTION_VERBS.has(w.toLowerCase().replace(/[^a-z]/g, "")))) score += 3;
      if (/\b[\w\-]+\.(?:ts|tsx|js|json|py|sh|sql)\b/.test(sentence)) score += 4;
      if (/\b[A-Z][a-zA-Z]{4,}\b/.test(sentence)) score += 2;
      if ((sentence.match(/\b[\w\-]+\.\w+\b/g) || []).length > 3) score -= 2;
      if (/`[^`]{3,}`/.test(para)) score += 2;
      if (/\b\d{3,}\b/.test(sentence)) score += 1;
      if (words.length <= 10 && /^(install|use|add|run|set|get|go|do|start|open|check|show|update|deploy)\b/i.test(sentence) && !(/\b(tab|page|modal|dashboard|memories|component|system|feature)\b/i.test(sentence))) score -= 6;
      if (paraIdx <= 2) score -= 3;
      if (/https?:\/\/\S+$/.test(sentence.trim())) score -= 4;
      if (/\b(tab|page|modal|component|panel|section|dashboard|memories|header|sidebar|button|card)\b/i.test(sentence)) score += 3;
      if (/\b(building|creating|building out|working on|implementing|setting up the|adding the)\b/i.test(sentence)) score += 4;
      if (words.length >= 6 && words.length <= 16) score += 3;
      if (words.length > 25) score -= 3;
      if (score > 0) candidates.push({ text: sentence, score });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0].text;
    const words = best.split(/\s+/).filter((w) => w.length > 0);
    title = words.slice(0, 9).join(" ");
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (title.length > 72) title = title.slice(0, 72).replace(/\s\S+$/, "…");
  } else {
    for (const para of paragraphs.slice(0, 8)) {
      const clean = para.replace(/```[\s\S]*?```/g, "").replace(/^[#*>\-_`\s]+/, "").replace(/\s+/g, " ").trim();
      if (clean.length >= 15) {
        const words = clean.split(/\s+/).slice(0, 8);
        title = words.join(" ");
        title = title.charAt(0).toUpperCase() + title.slice(1);
        break;
      }
    }
  }

  const allTokens = tokenize(excerpt);
  const bigrams = extractNgrams(allTokens, 2);
  const trigrams = extractNgrams(allTokens, 3);
  const scores = new Map<string, number>();
  const bump = (phrase: string, weight: number) => scores.set(phrase, (scores.get(phrase) ?? 0) + weight);
  allTokens.forEach((w) => bump(w, 1));
  bigrams.forEach((b) => bump(b, 2));
  trigrams.forEach((t) => bump(t, 3));

  const bucketScores = new Map<string, number>();
  for (const { label, keywords, weight = 1 } of TOPIC_BUCKETS) {
    let score = 0;
    for (const [phrase, freq] of scores) {
      for (const kw of keywords) {
        if (phrase === kw || phrase.includes(kw) || kw.startsWith(phrase)) score += freq;
      }
    }
    if (score > 0) bucketScores.set(label, score * weight);
  }

  const topBuckets = topN(bucketScores, 3);
  const specificTopics = extractSpecificTerms(excerpt)
    .filter((t) => t.length >= 5 && /[A-Z]/.test(t))
    .slice(0, 2)
    .map(titleCase);

  const merged: string[] = [];
  for (const topic of [...topBuckets, ...specificTopics]) {
    if (merged.length >= 4) break;
    if (!merged.some((m) => m.toLowerCase() === topic.toLowerCase())) merged.push(topic);
  }

  let topics = merged;
  if (topics.length === 0) {
    const topPhrases = topN(scores, 8)
      .filter((p) => p.split(" ").length >= 2)
      .slice(0, 3)
      .map(titleCase);
    topics = topPhrases.length > 0 ? topPhrases : ["General"];
  }

  const repair = buildRepairRecord(excerpt, title, topics.slice(0, 4), topBuckets[0] || topics[0] || "General");

  return {
    title: title.length > 4 ? title : "Untitled Session",
    primaryTopic: topBuckets[0] || topics[0] || "General",
    topics: topics.slice(0, 4),
    repair,
  };
}

export function extractSummaryKeyDetail(summaryText: string): string {
  if (!summaryText) return "";
  const lines = summaryText
    .split(/\n/)
    .map((l) => l.replace(/^[-*#>\s]+/, "").trim())
    .filter((l) => l.length > 20 && l.length < 200);

  const scored = lines.map((line) => {
    let score = 0;
    if (/\b[\w\-]+\.(?:ts|tsx|js|json|py|md)\b/.test(line)) score += 4;
    if (/\b[A-Z][a-zA-Z]{4,}\b/.test(line)) score += 2;
    if (ACTION_VERBS.has(line.split(/\s+/)[0].toLowerCase())) score += 3;
    if (/\b(?:fix|error|bug|fail|broken|issue|problem)\b/i.test(line)) score += 3;
    if (isGenericSentence(line)) score -= 5;
    if (/\b(?:session|conversation|context|summary|overview|previous|prior|this)\b/i.test(line)) score -= 3;
    return { line, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const result = scored[0]?.line || lines[0] || summaryText.replace(/\s+/g, " ").trim().slice(0, 120);
  if (result.length < 15) {
    const fallback = summaryText.split(/\n/).map((l) => l.trim()).find((l) => l.length >= 20);
    return fallback || result;
  }
  return result;
}

export async function analyzeSession(excerpt: string): Promise<AnalysisResult | null> {
  if (!excerpt.trim()) return null;
  return analyzeSessionLocal(excerpt);
}

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function scanClaudeJsonlFiles(projectsDir: string): QueuedSession[] {
  const results: QueuedSession[] = [];

  function scanDir(dir: string, project: string) {
    for (const entry of safeReadDir(dir)) {
      if (entry === "memory" || entry === "subagents") continue;
      const entryPath = path.join(dir, entry);
      try {
        const stat = fs.statSync(entryPath);
        if (entry.endsWith(".jsonl")) {
          results.push({
            sessionId: entry.replace(/\.jsonl$/, ""),
            filePath: entryPath,
            project,
            size: stat.size,
            provider: "claude",
          });
        } else if (stat.isDirectory()) {
          scanDir(entryPath, project);
        }
      } catch {
        // ignore
      }
    }
  }

  for (const folder of safeReadDir(projectsDir)) {
    const folderPath = path.join(projectsDir, folder);
    try {
      if (fs.statSync(folderPath).isDirectory()) scanDir(folderPath, folder);
    } catch {
      // ignore
    }
  }

  return results;
}

function loadCodexThreadIndex(indexPath: string): Map<string, CodexThreadEntry> {
  const threads = new Map<string, CodexThreadEntry>();
  if (!fs.existsSync(indexPath)) return threads;
  for (const line of fs.readFileSync(indexPath, "utf8").split("\n").filter(Boolean)) {
    try {
      const parsed = JSON.parse(line);
      const existing = threads.get(parsed.id);
      const nextUpdated = parsed.updated_at || null;
      if (!existing || (nextUpdated || "") >= (existing.updatedAt || "")) {
        threads.set(parsed.id, {
          threadName: typeof parsed.thread_name === "string" ? parsed.thread_name : null,
          updatedAt: nextUpdated,
        });
      }
    } catch {
      // ignore malformed lines
    }
  }
  return threads;
}

export function classifyCodexProject(input: { cwd?: string | null; title?: string | null; excerpt?: string | null }): string {
  const haystack = `${input.cwd || ""}\n${input.title || ""}\n${input.excerpt || ""}`.toLowerCase();
  if (/(ig-to-crm|crm acquisition|lead engine|task enterprise|hubspot|acquisition)/.test(haystack)) return "codex-task-enterprise";
  if (/(memory|memories|conversation archive|session index|claude-mem|codex memory)/.test(haystack)) return "codex-memory";
  if (/(openclaw|gateway|protocol|relay|transport)/.test(haystack)) return "codex-openclaw";
  if (/(mcp|model context protocol|tool registry|stdio server|mcp-server)/.test(haystack)) return "codex-mcp";
  if (/(abdi|ahmed|dame|rex|prime|atlas|ayub|sygma|agent ecosystem|agent package|multi-agent)/.test(haystack)) return "codex-agents";
  if (/(c2|command center|mission control|memories tab|hq|control-ui|dashboard)/.test(haystack)) return "codex-c2";
  return "codex-misc";
}

function readCodexSessionMeta(filePath: string): { sessionId: string | null; cwd: string | null; ts: string | null; firstPrompt: string | null } {
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let ts: string | null = null;
  let firstPrompt: string | null = null;

  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (!sessionId && parsed.type === "session_meta") {
        sessionId = parsed.payload?.id || null;
        cwd = parsed.payload?.cwd || null;
        ts = parsed.payload?.timestamp || parsed.timestamp || null;
      }
      if (!firstPrompt && parsed.type === "response_item" && parsed.payload?.type === "message" && parsed.payload?.role === "user") {
        const content = Array.isArray(parsed.payload?.content) ? parsed.payload.content : [];
        const text = cleanMessageText(extractCodexMessageText(content));
        if (text) firstPrompt = text.slice(0, 200);
      }
      if (sessionId && firstPrompt) break;
    } catch {
      // ignore malformed
    }
  }

  return { sessionId, cwd, ts, firstPrompt };
}

function scanCodexJsonlFiles(sessionsDir: string, sessionIndexPath: string): QueuedSession[] {
  const results: QueuedSession[] = [];
  const threadIndex = loadCodexThreadIndex(sessionIndexPath);

  const walk = (dir: string) => {
    for (const entry of safeReadDir(dir)) {
      const fullPath = path.join(dir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.endsWith(".jsonl") || !entry.startsWith("rollout-")) continue;
        const meta = readCodexSessionMeta(fullPath);
        const sessionId = meta.sessionId || entry.replace(/\.jsonl$/, "");
        const title = threadIndex.get(sessionId)?.threadName || path.basename(fullPath, ".jsonl");
        const excerpt = [title, meta.firstPrompt, meta.cwd].filter(Boolean).join("\n");
        results.push({
          sessionId,
          filePath: fullPath,
          project: classifyCodexProject({ cwd: meta.cwd, title, excerpt }),
          size: stat.size,
          provider: "codex",
        });
      } catch {
        // ignore
      }
    }
  };

  walk(sessionsDir);
  return results;
}

export class ConversationIndexer extends EventEmitter {
  private index: ConversationIndex;
  private queue: QueuedSession[] = [];
  private analyzing = 0;
  private readonly CONCURRENCY = 3;
  private readonly CODEX_POLL_INTERVAL_MS = 30_000;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private writeScheduled = false;
  private generation = 0;
  private claudeWatcherStarted = false;
  private codexPollStarted = false;
  private codexPollTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.index = readIndex();
  }

  getStatus() {
    return {
      indexed: Object.values(this.index.sessions).filter((s) => s.indexedAt !== null).length,
      pending: this.queue.length,
      analyzing: this.analyzing,
    };
  }

  getIndex(): ConversationIndex {
    return this.index;
  }

  async startup() {
    try {
      const codexFiles = [
        ...scanCodexJsonlFiles(CODEX_SESSIONS_DIR, CODEX_SESSION_INDEX_PATH),
        ...scanCodexJsonlFiles(CODEX_ARCHIVED_DIR, CODEX_SESSION_INDEX_PATH),
      ];
      // Deduplicate by sessionId — keep the larger file if both dirs have it
      const codexMap = new Map<string, QueuedSession>();
      for (const f of codexFiles) {
        const existing = codexMap.get(f.sessionId);
        if (!existing || f.size > existing.size) codexMap.set(f.sessionId, f);
      }
      const files = [
        ...scanClaudeJsonlFiles(CLAUDE_PROJECTS_DIR),
        ...codexMap.values(),
      ];
      for (const file of files) {
        const key = resolveSessionIndexKey(file.provider, file.sessionId);
        const existing = this.index.sessions[key];
        const needsIndex = !existing || existing.indexedAt === null || existing.fileSize !== file.size || existing.project !== file.project;
        if (needsIndex) this.queue.push(file);
      }
      this._drain();
      if (!this.claudeWatcherStarted) {
        this.claudeWatcherStarted = true;
        this._startClaudeWatcher();
      }
      if (!this.codexPollStarted) {
        this.codexPollStarted = true;
        this._startCodexPolling();
      }
    } catch (err) {
      console.warn("[ConversationIndexer] startup failed:", err);
    }
  }

  reindex() {
    this.index = { version: INDEX_VERSION, updatedAt: new Date().toISOString(), topicColors: {}, sessions: {} };
    this._scheduleWrite();
    this.queue = [];
    this.generation++;
    void this.startup();
  }

  private _startClaudeWatcher() {
    const dir = CLAUDE_PROJECTS_DIR;
    const watchDir = (subdir: string) => {
      try {
        fs.watch(subdir, (_event, filename) => {
          if (!filename || !filename.endsWith(".jsonl")) return;
          const fullPath = path.join(subdir, filename);
          const existing = this.debounceTimers.get(fullPath);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            this.debounceTimers.delete(fullPath);
            try {
              const stat = fs.statSync(fullPath);
              const project = path.relative(CLAUDE_PROJECTS_DIR, fullPath).replace(/\\/g, "/").split("/")[0];
              const sessionId = filename.replace(/\.jsonl$/, "");
              const key = resolveSessionIndexKey("claude", sessionId);
              const indexed = this.index.sessions[key];
              if (!indexed || indexed.indexedAt === null || indexed.fileSize !== stat.size) {
                this.queue.push({ sessionId, filePath: fullPath, project, size: stat.size, provider: "claude" });
                this._drain();
              }
            } catch {
              // removed
            }
          }, 3000);
          this.debounceTimers.set(fullPath, timer);
        });
      } catch {
        // ignore unsupported watcher
      }
    };

    try {
      fs.watch(dir, (_event, filename) => {
        if (!filename) return;
        const subdir = path.join(dir, filename);
        try {
          if (fs.statSync(subdir).isDirectory()) watchDir(subdir);
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }

    for (const folder of safeReadDir(dir)) {
      const subdir = path.join(dir, folder);
      try {
        if (fs.statSync(subdir).isDirectory()) watchDir(subdir);
      } catch {
        // ignore
      }
    }
  }

  private _startCodexPolling() {
    const poll = () => {
      try {
        const allFiles = [
          ...scanCodexJsonlFiles(CODEX_SESSIONS_DIR, CODEX_SESSION_INDEX_PATH),
          ...scanCodexJsonlFiles(CODEX_ARCHIVED_DIR, CODEX_SESSION_INDEX_PATH),
        ];
        const deduped = new Map<string, QueuedSession>();
        for (const f of allFiles) {
          const existing = deduped.get(f.sessionId);
          if (!existing || f.size > existing.size) deduped.set(f.sessionId, f);
        }
        const files = [...deduped.values()];
        for (const file of files) {
          const key = resolveSessionIndexKey(file.provider, file.sessionId);
          const indexed = this.index.sessions[key];
          if (!indexed || indexed.indexedAt === null || indexed.fileSize !== file.size || indexed.project !== file.project) {
            this.queue.push(file);
          }
        }
        this._drain();
      } catch {
        // ignore transient polling failures
      }
    };

    poll();
    this.codexPollTimer = setInterval(poll, this.CODEX_POLL_INTERVAL_MS);
  }

  private _scheduleWrite() {
    if (this.writeScheduled) return;
    this.writeScheduled = true;
    setImmediate(() => {
      this.writeScheduled = false;
      try {
        writeIndex(this.index);
      } catch {
        // ignore
      }
    });
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

  private async _processOne(item: QueuedSession) {
    const gen = this.generation;
    const key = resolveSessionIndexKey(item.provider, item.sessionId);
    try {
      const excerpt = extractUserMessages(item.filePath, item.provider);
      let result = await analyzeSession(excerpt);
      if (!result || result.title === "Untitled Session") {
        const fallbackProject = item.project
          .replace(/^codex-/, "")
          .replace(/^c--Users-\w+-/i, "")
          .replace(/^C--Users-\w+-/i, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim() || "Background Session";
        const fallbackTitle = `${fallbackProject} - Background`;
        result = {
          title: fallbackTitle,
          primaryTopic: "Background Session",
          topics: [],
          repair: buildRepairRecord(excerpt, fallbackTitle, [], item.project),
        };
      }
      if (gen !== this.generation) return;

      const cardColors: string[] = [];
      const topics = result.topics || [];
      for (const topic of topics) {
        if (!this.index.topicColors[topic]) {
          this.index.topicColors[topic] = assignColor(topic, this.index.topicColors, cardColors);
        }
        cardColors.push(this.index.topicColors[topic]);
      }

      const relBase = item.provider === "codex" ? CODEX_SESSIONS_DIR : CLAUDE_PROJECTS_DIR;
      const relPath = path.relative(relBase, item.filePath).replace(/\\/g, "/");
      const sessionData: SessionIndex = {
        title: result.title || "Untitled",
        primaryTopic: result.primaryTopic || "Uncategorized",
        topics,
        project: item.project,
        repair: result.repair || buildRepairRecord(excerpt, result.title || "Untitled", topics, item.project),
        indexedAt: new Date().toISOString(),
        fileSize: item.size,
        provider: item.provider,
        sessionId: item.sessionId,
        ts: (() => { try { return fs.statSync(item.filePath).mtime.toISOString(); } catch { return null; } })(),
        file: `${item.provider}:${relPath}`,
      };

      this.index.sessions[key] = sessionData;
      this._scheduleWrite();
      this.emit("indexed", { sessionId: item.sessionId, provider: item.provider, key, data: sessionData, topicColors: this.index.topicColors });
    } catch {
      if (gen !== this.generation) return;
      this.index.sessions[key] = {
        title: "Untitled",
        primaryTopic: "Unknown",
        topics: [],
        project: item.project,
        repair: {
          status: "Blocked",
          mainProblem: "Conversation could not be indexed.",
          rootCause: "Indexer failed while reading or analyzing this session.",
          affectedSystem: item.project,
          stepsTaken: ["Attempted to read and analyze the conversation JSONL."],
          solution: "No solution captured because indexing failed.",
          filesAndTools: [path.basename(item.filePath)],
          validationEvidence: ["Indexer wrote a blocked fallback record."],
          remainingRisks: ["Raw conversation may still need manual review."],
          nextAction: "Open the raw conversation file and rerun indexing after correcting the read/analyze failure.",
          summary: "Indexing failed; manual review required.",
        },
        indexedAt: null,
        fileSize: item.size,
        provider: item.provider,
      };
      this._scheduleWrite();
    }
  }
}

export const conversationIndexer = new ConversationIndexer();
