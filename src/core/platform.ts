import { getPlatform } from "../config";

/**
 * Platform detection and OS-specific helpers
 */
export class Platform {
  static isWindows(): boolean {
    return process.platform === "win32";
  }

  static isLinux(): boolean {
    return process.platform === "linux";
  }

  static isMacOS(): boolean {
    return process.platform === "darwin";
  }

  static get current(): "windows" | "linux" | "macos" {
    return getPlatform();
  }

  /**
   * Normalize a file path for the current OS
   */
  static normalizePath(p: string): string {
    if (this.isWindows()) {
      // On Windows, forward slashes are fine; backslashes preferred but not required
      return p.replace(/\//g, "\\");
    }
    // On Unix-like systems, use forward slashes
    return p.replace(/\\/g, "/");
  }

  /**
   * Get the path separator for the current OS
   */
  static get pathSeparator(): string {
    return this.isWindows() ? "\\" : "/";
  }

  /**
   * Join path segments appropriately for OS
   */
  static joinPath(...segments: string[]): string {
    const sep = this.pathSeparator;
    return segments.join(sep);
  }
}
