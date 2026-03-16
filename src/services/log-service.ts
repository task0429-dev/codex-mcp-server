import fs from "fs";
import path from "path";
import { LOG_DIR } from "../config";

/**
 * Log service: retrieve recent logs for agents
 */
export class LogService {
  /**
   * Get recent log lines for an agent
   *
   * @param agentName - Agent name (optional for global logs)
   * @param lineCount - Number of recent lines to return (default 100)
   * @returns Log content (last N lines)
   */
  static getRecentLogs(agentName: string | undefined, lineCount: number = 100): string {
    const fileName = agentName ? `${agentName.toLowerCase()}.log` : "global.log";
    const filePath = path.join(LOG_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      return `[No logs available for ${fileName}]`;
    }

    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const lines = data.split(/\r?\n/);
      const recent = lines.slice(-lineCount).join("\n");

      // Truncate if extremely large
      const maxSize = 50_000; // ~50KB limit
      if (recent.length > maxSize) {
        return (
          `[Truncated: showing last ${lineCount} lines, ~${recent.length} bytes]\n\n` +
          recent.slice(-maxSize)
        );
      }

      return recent;
    } catch (err: any) {
      return `[Error reading logs: ${err.message}]`;
    }
  }

  /**
   * Append a log entry (for internal use)
   */
  static appendLog(agentName: string | undefined, entry: string): void {
    const fileName = agentName ? `${agentName.toLowerCase()}.log` : "global.log";
    const filePath = path.join(LOG_DIR, fileName);

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      fs.appendFileSync(filePath, `[${timestamp}] ${entry}\n`);
    } catch (err) {
      // Silent fail for logging errors
      console.error("Failed to append log:", err);
    }
  }

  /**
   * Get all available log files
   */
  static listLogFiles(): string[] {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        return [];
      }
      return fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".log"));
    } catch {
      return [];
    }
  }
}
