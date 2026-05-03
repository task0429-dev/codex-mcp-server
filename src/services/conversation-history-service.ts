import fs from "fs";
import path from "path";
import { MEMORY_DIR } from "../config";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TURNS = 60;

interface HistoryEntry {
  ts: string;
  role: "user" | "assistant";
  content: string;
}

function historyFile(agentName: string): string {
  const dir = path.join(MEMORY_DIR, agentName.toLowerCase());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "conversation_history.jsonl");
}

export class ConversationHistoryService {
  static load(agentName: string): Array<{ role: "user" | "assistant"; content: string }> {
    const file = historyFile(agentName);
    if (!fs.existsSync(file)) return [];

    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
    const recent: HistoryEntry[] = [];

    for (const line of lines) {
      try {
        const entry: HistoryEntry = JSON.parse(line);
        if (new Date(entry.ts).getTime() >= cutoff) recent.push(entry);
      } catch {
        // Ignore malformed lines.
      }
    }

    return recent.slice(-MAX_TURNS).map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));
  }

  static save(agentName: string, userMessage: string, assistantReply: string): void {
    const file = historyFile(agentName);
    const now = new Date().toISOString();
    const userLine = JSON.stringify({ ts: now, role: "user", content: userMessage } as HistoryEntry);
    const assistantLine = JSON.stringify({ ts: now, role: "assistant", content: assistantReply } as HistoryEntry);
    fs.appendFileSync(file, `${userLine}\n${assistantLine}\n`);
  }

  static prune(agentName: string): void {
    const file = historyFile(agentName);
    if (!fs.existsSync(file)) return;

    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
    const kept = lines.filter((line) => {
      try {
        return new Date(JSON.parse(line).ts).getTime() >= cutoff;
      } catch {
        return false;
      }
    });

    fs.writeFileSync(file, kept.join("\n") + (kept.length ? "\n" : ""));
  }
}
