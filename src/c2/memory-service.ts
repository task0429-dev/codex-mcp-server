import crypto from "crypto";
import { MemoryRecord, MemoryRecordSchema, MemorySearchQuery, SeveritySchema } from "./contracts";
import { appendJsonLine, c2Events, readJsonLines } from "./store";
import { LogService } from "../services/log-service";

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function embedText(input: string, dimensions = 64): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokenize(input)) {
    const hash = crypto.createHash("sha256").update(token).digest();
    for (let i = 0; i < dimensions; i += 1) {
      const byte = hash[i % hash.length];
      vector[i] += (byte / 255) * (i % 2 === 0 ? 1 : -1);
    }
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
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

  if (!leftMag || !rightMag) {
    return 0;
  }

  return dot / (Math.sqrt(leftMag) * Math.sqrt(rightMag));
}

function keywordScore(record: MemoryRecord, query: string) {
  if (!query.trim()) {
    return 0;
  }

  const haystack = `${record.summary} ${record.detail} ${record.tags.join(" ")} ${record.source}`.toLowerCase();
  return tokenize(query).reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

export class C2MemoryService {
  private readonly fileName = "memory-events.jsonl";

  private bootstrapExistingLogs() {
    const records = readJsonLines<MemoryRecord>(this.fileName);
    if (records.length > 0) {
      return;
    }

    for (const file of LogService.listLogFiles()) {
      const source = file.replace(/\.log$/i, "");
      const lines = LogService.getRecentLogs(source === "global" ? undefined : source, 24)
        .split(/\r?\n/)
        .filter(Boolean);

      for (const line of lines.slice(-12)) {
        void this.record({
          source: "legacy-log-bootstrap",
          kind: "log_line",
          severity: line.toLowerCase().includes("error") ? "error" : line.toLowerCase().includes("warn") ? "warning" : "info",
          summary: `${source} log`,
          detail: line,
          agentId: null,
          projectId: null,
          tags: ["bootstrap", "log", source],
          correlationId: null,
          metadata: { file },
        });
      }
    }
  }

  listAll(): MemoryRecord[] {
    this.bootstrapExistingLogs();
    return readJsonLines<MemoryRecord>(this.fileName)
      .map((record) => MemoryRecordSchema.parse(record))
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }

  async record(input: Omit<MemoryRecord, "id" | "timestamp" | "embedding"> & { timestamp?: string }) {
    const record: MemoryRecord = MemoryRecordSchema.parse({
      id: crypto.randomUUID(),
      timestamp: input.timestamp || new Date().toISOString(),
      source: input.source,
      kind: input.kind,
      severity: SeveritySchema.parse(input.severity),
      summary: input.summary,
      detail: input.detail,
      agentId: input.agentId,
      projectId: input.projectId,
      tags: input.tags,
      correlationId: input.correlationId,
      metadata: input.metadata,
      embedding: embedText(`${input.summary}\n${input.detail}\n${input.tags.join(" ")}`),
    });

    appendJsonLine(this.fileName, record);
    c2Events.emit("memory", record);
    return record;
  }

  search(query: MemorySearchQuery) {
    const records = this.listAll();
    const semanticVector = embedText(query.q || "");

    const filtered = records.filter((record) => {
      if (query.agentId && record.agentId !== query.agentId) return false;
      if (query.projectId && record.projectId !== query.projectId) return false;
      if (query.source && record.source !== query.source) return false;
      if (query.severity && record.severity !== query.severity) return false;
      if (query.tag && !record.tags.includes(query.tag)) return false;
      if (query.from && new Date(record.timestamp).getTime() < new Date(query.from).getTime()) return false;
      if (query.to && new Date(record.timestamp).getTime() > new Date(query.to).getTime()) return false;
      return true;
    });

    const ranked = filtered
      .map((record) => {
        const exact = keywordScore(record, query.q);
        const semantic = query.q ? cosineSimilarity(record.embedding, semanticVector) : 0;
        const relevance = Number((exact * 0.65 + semantic * 0.35).toFixed(4));
        return {
          record,
          relevance,
          exactMatches: exact,
          semanticScore: Number(semantic.toFixed(4)),
        };
      })
      .sort((left, right) => right.relevance - left.relevance || new Date(right.record.timestamp).getTime() - new Date(left.record.timestamp).getTime());

    const start = query.cursor || 0;
    const end = start + query.limit;

    return {
      query: query.q || "",
      cursor: end < ranked.length ? end : null,
      total: ranked.length,
      items: ranked.slice(start, end).map((entry) => ({
        ...entry.record,
        relevance: entry.relevance,
        exactMatches: entry.exactMatches,
        semanticScore: entry.semanticScore,
      })),
    };
  }

  summarize() {
    const records = this.listAll();
    const bySeverity = records.reduce<Record<string, number>>((acc, record) => {
      acc[record.severity] = (acc[record.severity] || 0) + 1;
      return acc;
    }, {});

    const bySource = records.reduce<Record<string, number>>((acc, record) => {
      acc[record.source] = (acc[record.source] || 0) + 1;
      return acc;
    }, {});

    return {
      totalRecords: records.length,
      lastRecordAt: records[0]?.timestamp || null,
      bySeverity,
      topSources: Object.entries(bySource)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([source, count]) => ({ source, count })),
    };
  }
}
