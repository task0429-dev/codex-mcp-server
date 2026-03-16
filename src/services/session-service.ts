import fs from "fs";
import path from "path";
import { SESSION_DIR } from "../config";

export interface SessionMetadata {
  file: string;
  mtime: string;
  size: number;
  locked: boolean;
  lockAge?: number;
}

/**
 * Session service: manage agent session files and locks
 */
export class SessionService {
  /**
   * List all sessions for an agent
   */
  static listSessions(agentName: string): SessionMetadata[] {
    const agentDir = path.join(SESSION_DIR, agentName.toLowerCase());

    if (!fs.existsSync(agentDir)) {
      return [];
    }

    if (!fs.statSync(agentDir).isDirectory()) {
      return [];
    }

    const files = fs.readdirSync(agentDir);
    return files
      .map((file) => {
        const full = path.join(agentDir, file);
        try {
          const stat = fs.statSync(full);
          const locked = file.endsWith(".lock");
          const lockAge = locked ? Date.now() - stat.mtimeMs : undefined;

          return {
            file,
            mtime: stat.mtime.toISOString(),
            size: stat.size,
            locked,
            lockAge,
          };
        } catch {
          return null;
        }
      })
      .filter((s) => s !== null) as SessionMetadata[];
  }

  /**
   * Unlock a session (only stale locks, never active locks)
   *
   * Rules:
   * - Only .lock files can be unlocked
   * - Lock must be older than 1 hour to be cleared
   * - This prevents accidental removal of active locks
   */
  static unlockSession(agentName: string, sessionFile: string): { success: boolean; message: string } {
    // Validate that this is a lock file
    if (!sessionFile.endsWith(".lock")) {
      return {
        success: false,
        message: "Can only unlock .lock files",
      };
    }

    const agentDir = path.join(SESSION_DIR, agentName.toLowerCase());
    const filePath = path.join(agentDir, sessionFile);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: "Session file not found",
      };
    }

    // Check age (must be older than 1 hour)
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const oneHourMs = 60 * 60 * 1000;

    if (ageMs < oneHourMs) {
      const minutesOld = Math.floor(ageMs / 60000);
      return {
        success: false,
        message: `Lock is only ${minutesOld} minutes old; must be at least 60 minutes old to clear`,
      };
    }

    // Remove the lock file
    try {
      fs.unlinkSync(filePath);
      return {
        success: true,
        message: `Cleared stale lock on ${sessionFile} (was ${Math.floor(ageMs / 1000)} seconds old)`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to remove lock: ${err.message}`,
      };
    }
  }

  /**
   * Create or ensure agent session directory exists
   */
  static ensureAgentDir(agentName: string): boolean {
    const agentDir = path.join(SESSION_DIR, agentName.toLowerCase());
    try {
      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
      }
      return true;
    } catch (err) {
      return false;
    }
  }
}
