import fs from "fs";
import path from "path";
import { MEMORY_DIR } from "../config";

export interface MemoryMatch {
  file: string;
  snippet: string;
  context?: string;
}

/**
 * Memory service: search local memory files for agents
 * Supports JSON, JSONL, Markdown, and plain text files
 */
export class MemoryService {
  /**
   * Search for a query in an agent's memory files
   *
   * @param agentName - Agent name
   * @param query - Search query (substring match)
   * @returns Array of matches with snippets
   */
  static searchMemory(agentName: string, query: string): MemoryMatch[] {
    const agentDir = path.join(MEMORY_DIR, agentName.toLowerCase());

    if (!fs.existsSync(agentDir) || !fs.statSync(agentDir).isDirectory()) {
      return [];
    }

    const matches: MemoryMatch[] = [];
    const files = fs.readdirSync(agentDir);

    for (const file of files) {
      const full = path.join(agentDir, file);

      try {
        if (!fs.statSync(full).isFile()) continue;

        const data = fs.readFileSync(full, "utf-8");

        const lowerData = data.toLowerCase();
        const lowerQuery = query.toLowerCase();
        if (lowerData.includes(lowerQuery)) {
          const idx = lowerData.indexOf(lowerQuery);
          const start = Math.max(0, idx - 100);
          const end = Math.min(data.length, idx + lowerQuery.length + 100);
          const snippet = data.slice(start, end);

          matches.push({
            file,
            snippet: snippet.trim(),
            context: file, // file is the context here
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return matches;
  }

  /**
   * List all memory files for an agent
   */
  static listMemoryFiles(agentName: string): string[] {
    const agentDir = path.join(MEMORY_DIR, agentName.toLowerCase());

    if (!fs.existsSync(agentDir)) {
      return [];
    }

    try {
      return fs
        .readdirSync(agentDir)
        .filter((f) => fs.statSync(path.join(agentDir, f)).isFile())
        .map((f) => f);
    } catch {
      return [];
    }
  }

  /**
   * Store a memory entry (for internal use)
   *
   * @param agentName - Agent name
   * @param filename - Filename (e.g. "conversations.jsonl", "notes.md")
   * @param content - Content to append or write
   */
  static storeMemory(agentName: string, filename: string, content: string): boolean {
    const agentDir = path.join(MEMORY_DIR, agentName.toLowerCase());

    try {
      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
      }

      const filePath = path.join(agentDir, filename);

      // If JSONL, append; otherwise, write
      if (filename.endsWith(".jsonl")) {
        fs.appendFileSync(filePath, content + "\n");
      } else {
        fs.appendFileSync(filePath, content + "\n");
      }

      return true;
    } catch {
      return false;
    }
  }
}
