import { spawn } from "child_process";
import { POWERSHELL_PATH, DEFAULT_TIMEOUT_MS } from "../config";

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  code: number | null;
  error?: string;
}

/**
 * Safe PowerShell command executor for Windows.
 *
 * IMPORTANT: Only safe, pre-approved commands are executed.
 * This is NOT a general shell interface.
 * Commands are always executed with -NoProfile -NonInteractive.
 */
export class PowerShell {
  /**
   * Run a command via PowerShell and capture output.
   *
   * @param cmd - The PowerShell command string
   * @param timeout - Execution timeout in milliseconds
   * @returns ExecutionResult with stdout, stderr, code
   *
   * WARNING: Only call with known-safe commands.
   */
  static async runCommand(
    cmd: string,
    timeout: number = DEFAULT_TIMEOUT_MS
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const proc = spawn(POWERSHELL_PATH, ["-NoProfile", "-NonInteractive", "-Command", cmd], {
        shell: false,
        timeout,
      });

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        proc.kill();
        resolve({
          stdout,
          stderr,
          code: null,
          error: `Command timed out after ${timeout}ms`,
        });
      }, timeout);

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          code: 1,
          error: err.message,
        });
      });
    });
  }

  /**
   * Simple helper: echo + safe parameter
   * Useful for testing or simple output
   */
  static async echo(message: string): Promise<string> {
    // Escape quotes in message
    const escaped = message.replace(/"/g, '""');
    const res = await this.runCommand(`Write-Output "${escaped}"`);
    return res.stdout.trim();
  }
}
