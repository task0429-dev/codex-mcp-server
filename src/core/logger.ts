import { config } from "../config/config";

export interface Logger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

/**
 * Simple console logger with configurable level
 */
class ConsoleLogger implements Logger {
  private level: string;

  constructor(level: string = "info") {
    this.level = level;
  }

  private shouldLog(level: string): boolean {
    const levels = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog("info")) {
      console.log(`[INFO] ${new Date().toISOString()} ${message}`, meta || "");
    }
  }

  error(message: string, meta?: any): void {
    if (this.shouldLog("error")) {
      console.error(`[ERROR] ${new Date().toISOString()} ${message}`, meta || "");
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] ${new Date().toISOString()} ${message}`, meta || "");
    }
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog("debug")) {
      console.debug(`[DEBUG] ${new Date().toISOString()} ${message}`, meta || "");
    }
  }
}

// Global logger instance - lazy initialization to avoid circular deps
let loggerInstance: Logger | null = null;

function getLogger(): Logger {
  if (!loggerInstance) {
    // Safe access to config, with fallback
    let logLevel = "info";
    try {
      logLevel = config.LOG_LEVEL || "info";
    } catch {
      // Config not available yet, use default
    }
    loggerInstance = new ConsoleLogger(logLevel);
  }
  return loggerInstance;
}

export const logger = getLogger();