import { spawn } from "child_process";
import path from "path";
import { hubConfig } from "../config/hub-config";
import { ToolError } from "../utils/errors";
import { ensurePathAllowed } from "../utils/paths";

const WINDOWS_WRAPPER_COMMANDS = new Set(["npm", "npx", "pnpm", "yarn", "bun"]);

function normalizeCommandName(command: string): string {
  return path.basename(command).replace(/\.(exe|cmd|bat)$/i, "").toLowerCase();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

function buildSpawnSpec(command: string, args: string[], shell: boolean): { command: string; args: string[]; shell: boolean } {
  if (shell) {
    if (process.platform === "win32") {
      return {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", command, ...args],
        shell: false,
      };
    }

    return {
      command: "/bin/sh",
      args: ["-lc", [command, ...args].join(" ")],
      shell: false,
    };
  }

  const normalizedCommand = normalizeCommandName(command);
  if (process.platform === "win32" && WINDOWS_WRAPPER_COMMANDS.has(normalizedCommand)) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args],
      shell: false,
    };
  }

  return { command, args, shell: false };
}

export interface RunCommandOptions {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  shell?: boolean;
  maxOutputChars?: number;
}

export async function runSafeCommand(options: RunCommandOptions): Promise<{
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  const command = options.command.trim();
  const args = options.args || [];
  const cwd = ensurePathAllowed(options.cwd || hubConfig.projectRoot, hubConfig.terminal.allowedCwds, hubConfig.filesystem.deniedPaths);
  const timeoutMs = Math.min(options.timeoutMs || hubConfig.terminal.defaultTimeoutMs, hubConfig.terminal.maxTimeoutMs);
  const maxOutputChars = options.maxOutputChars || hubConfig.terminal.maxOutputChars;
  const normalizedCommand = normalizeCommandName(command);

  if (hubConfig.terminal.deniedCommands.includes(normalizedCommand)) {
    throw new ToolError(`Command is denied by policy: ${command}`, {
      code: "permission_denied",
      statusCode: 403,
    });
  }

  if (!hubConfig.terminal.allowedCommands.includes("*") && !hubConfig.terminal.allowedCommands.includes(normalizedCommand)) {
    throw new ToolError(`Command is not in the allowlist: ${command}`, {
      code: "permission_denied",
      statusCode: 403,
      details: { allowedCommands: hubConfig.terminal.allowedCommands },
    });
  }

  const shell = Boolean(options.shell);
  if (shell && !hubConfig.terminal.allowShell) {
    throw new ToolError("Shell execution is disabled by policy.", {
      code: "permission_denied",
      statusCode: 403,
    });
  }

  const spawnSpec = buildSpawnSpec(command, args, shell);

  return new Promise((resolve, reject) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd,
      shell: spawnSpec.shell,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new ToolError(`Failed to start command: ${error.message}`, {
          code: "runtime_error",
          statusCode: 500,
        })
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command,
        args,
        cwd,
        exitCode: code ?? 0,
        stdout: truncate(stdout.trim(), maxOutputChars),
        stderr: truncate(stderr.trim(), maxOutputChars),
        timedOut,
      });
    });
  });
}
