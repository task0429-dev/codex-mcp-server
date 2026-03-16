import os from "os";
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

const projectRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.resolve(projectRoot, ".env") });

const listFromEnv = (value: string | undefined, fallback: string[] = []): string[] =>
  value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : fallback;

const booleanFromEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
};

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const keyValueMapFromEnv = (value: string | undefined, fallback: Record<string, string> = {}): Record<string, string> => {
  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, entry) => {
      const [rawKey, ...rawValueParts] = entry.split("=");
      const key = rawKey?.trim().toLowerCase();
      const mappedValue = rawValueParts.join("=").trim();
      if (key && mappedValue) {
        accumulator[key] = mappedValue;
      }
      return accumulator;
    }, { ...fallback });
};

const EnvSchema = z.object({
  ENABLE_AGENT_CORE_TOOLS: z.string().optional(),
  ENABLE_FILESYSTEM_TOOLS: z.string().optional(),
  ENABLE_TERMINAL_TOOLS: z.string().optional(),
  ENABLE_DOCKER_TOOLS: z.string().optional(),
  ENABLE_GIT_TOOLS: z.string().optional(),
  ENABLE_NOTION_TOOLS: z.string().optional(),
  ENABLE_DATABASE_TOOLS: z.string().optional(),
  ENABLE_WEB_TOOLS: z.string().optional(),
  ENABLE_SYSTEM_TOOLS: z.string().optional(),
  ENABLE_DESKTOP_TOOLS: z.string().optional(),
  ENABLE_LEGACY_CLOUD_TOOLS: z.string().optional(),
  HUB_LOG_LEVEL: z.string().optional(),
  HUB_REDACT_LOG_KEYS: z.string().optional(),
  FILESYSTEM_ALLOWED_ROOTS: z.string().optional(),
  FILESYSTEM_DENIED_PATHS: z.string().optional(),
  FILESYSTEM_MAX_FILE_SIZE_BYTES: z.string().optional(),
  FILESYSTEM_MAX_READ_BYTES: z.string().optional(),
  FILESYSTEM_MAX_SEARCH_RESULTS: z.string().optional(),
  FILESYSTEM_READ_ONLY: z.string().optional(),
  FILESYSTEM_ALLOW_DELETE: z.string().optional(),
  FILESYSTEM_ALLOW_MOVE: z.string().optional(),
  FILESYSTEM_ALLOW_COPY: z.string().optional(),
  TERMINAL_ALLOWED_COMMANDS: z.string().optional(),
  TERMINAL_DENIED_COMMANDS: z.string().optional(),
  TERMINAL_DEFAULT_TIMEOUT_MS: z.string().optional(),
  TERMINAL_MAX_TIMEOUT_MS: z.string().optional(),
  TERMINAL_MAX_OUTPUT_CHARS: z.string().optional(),
  TERMINAL_ALLOW_SHELL: z.string().optional(),
  TERMINAL_ALLOWED_CWDS: z.string().optional(),
  DOCKER_REQUIRE_CONFIRMATION: z.string().optional(),
  DOCKER_ALLOW_DESTRUCTIVE: z.string().optional(),
  DOCKER_MAX_LOG_LINES: z.string().optional(),
  GIT_ALLOW_COMMIT: z.string().optional(),
  GIT_ALLOWED_ROOTS: z.string().optional(),
  GIT_DEFAULT_LOG_LIMIT: z.string().optional(),
  NOTION_TOKEN: z.string().optional(),
  NOTION_ALLOW_WRITE: z.string().optional(),
  POSTGRES_URL: z.string().optional(),
  DATABASE_ALLOW_WRITE: z.string().optional(),
  DATABASE_QUERY_TIMEOUT_MS: z.string().optional(),
  SQLITE_ALLOWED_PATHS: z.string().optional(),
  WEB_ALLOWED_HOSTS: z.string().optional(),
  WEB_REQUEST_TIMEOUT_MS: z.string().optional(),
  SYSTEM_PORT_SCAN_LIMIT: z.string().optional(),
  DESKTOP_ALLOWED_PROTOCOLS: z.string().optional(),
  DESKTOP_ALLOWED_PATH_ROOTS: z.string().optional(),
  DESKTOP_ALLOWED_APP_ROOTS: z.string().optional(),
  DESKTOP_APP_ALIASES: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

const defaultAllowedRoots = [
  projectRoot,
  path.resolve(projectRoot, ".."),
  path.resolve(projectRoot, "workspaces"),
];

const defaultDeniedPaths = [
  path.resolve(projectRoot, ".git"),
  path.resolve(projectRoot, "node_modules"),
  path.resolve(projectRoot, "data", "logs"),
];

const defaultDesktopAliases: Record<string, string> = {
  calc: "calc.exe",
  calculator: "calc.exe",
  chrome: "chrome.exe",
  cmd: "cmd.exe",
  edge: "msedge.exe",
  explorer: "explorer.exe",
  notepad: "notepad.exe",
  paint: "mspaint.exe",
  powershell: "powershell.exe",
  pwsh: "pwsh.exe",
  taskmanager: "taskmgr.exe",
  taskmgr: "taskmgr.exe",
  vscode: "Code.exe",
};

const defaultDesktopPathRoots = [projectRoot, path.resolve(projectRoot, ".."), os.homedir()];
const defaultDesktopAppRoots = [
  process.env.ProgramFiles,
  process.env["ProgramFiles(x86)"],
  process.env.LOCALAPPDATA,
  process.env.SystemRoot,
  os.homedir(),
]
  .filter(Boolean)
  .map((entry) => path.resolve(entry as string));

export const hubConfig = {
  projectRoot,
  features: {
    agentCore: booleanFromEnv(env.ENABLE_AGENT_CORE_TOOLS, true),
    filesystem: booleanFromEnv(env.ENABLE_FILESYSTEM_TOOLS, true),
    terminal: booleanFromEnv(env.ENABLE_TERMINAL_TOOLS, true),
    docker: booleanFromEnv(env.ENABLE_DOCKER_TOOLS, true),
    git: booleanFromEnv(env.ENABLE_GIT_TOOLS, true),
    notion: booleanFromEnv(env.ENABLE_NOTION_TOOLS, true),
    database: booleanFromEnv(env.ENABLE_DATABASE_TOOLS, true),
    web: booleanFromEnv(env.ENABLE_WEB_TOOLS, true),
    system: booleanFromEnv(env.ENABLE_SYSTEM_TOOLS, true),
    desktop: booleanFromEnv(env.ENABLE_DESKTOP_TOOLS, true),
    legacyCloud: booleanFromEnv(env.ENABLE_LEGACY_CLOUD_TOOLS, true),
  },
  logging: {
    level: env.HUB_LOG_LEVEL || process.env.LOG_LEVEL || "info",
    redactKeys: listFromEnv(env.HUB_REDACT_LOG_KEYS, [
      "authorization",
      "cookie",
      "token",
      "secret",
      "password",
      "apiKey",
      "apikey",
      "accessToken",
      "refreshToken",
    ]),
  },
  filesystem: {
    allowedRoots: listFromEnv(env.FILESYSTEM_ALLOWED_ROOTS, defaultAllowedRoots).map((entry) => path.resolve(entry)),
    deniedPaths: listFromEnv(env.FILESYSTEM_DENIED_PATHS, defaultDeniedPaths).map((entry) => path.resolve(entry)),
    maxFileSizeBytes: numberFromEnv(env.FILESYSTEM_MAX_FILE_SIZE_BYTES, 2_000_000),
    maxReadBytes: numberFromEnv(env.FILESYSTEM_MAX_READ_BYTES, 500_000),
    maxSearchResults: numberFromEnv(env.FILESYSTEM_MAX_SEARCH_RESULTS, 200),
    readOnly: booleanFromEnv(env.FILESYSTEM_READ_ONLY, false),
    allowDelete: booleanFromEnv(env.FILESYSTEM_ALLOW_DELETE, false),
    allowMove: booleanFromEnv(env.FILESYSTEM_ALLOW_MOVE, true),
    allowCopy: booleanFromEnv(env.FILESYSTEM_ALLOW_COPY, true),
  },
  terminal: {
    allowedCommands: listFromEnv(env.TERMINAL_ALLOWED_COMMANDS, [
      "git",
      "docker",
      "node",
      "npm",
      "npx",
      "pnpm",
      "yarn",
      "bun",
      "python",
      "python3",
      "pip",
      "pip3",
      "tsc",
      "pwsh",
      "powershell",
      "cmd",
      "netstat",
      "ss",
    ]),
    deniedCommands: listFromEnv(env.TERMINAL_DENIED_COMMANDS, [
      "rm",
      "del",
      "shutdown",
      "reboot",
      "halt",
      "poweroff",
      "mkfs",
      "diskpart",
      "format",
      "reg",
      "cipher",
      "takeown",
      "icacls",
    ]),
    defaultTimeoutMs: numberFromEnv(env.TERMINAL_DEFAULT_TIMEOUT_MS, 30_000),
    maxTimeoutMs: numberFromEnv(env.TERMINAL_MAX_TIMEOUT_MS, 300_000),
    maxOutputChars: numberFromEnv(env.TERMINAL_MAX_OUTPUT_CHARS, 20_000),
    allowShell: booleanFromEnv(env.TERMINAL_ALLOW_SHELL, false),
    allowedCwds: listFromEnv(env.TERMINAL_ALLOWED_CWDS, defaultAllowedRoots).map((entry) => path.resolve(entry)),
  },
  docker: {
    requireConfirmation: booleanFromEnv(env.DOCKER_REQUIRE_CONFIRMATION, true),
    allowDestructive: booleanFromEnv(env.DOCKER_ALLOW_DESTRUCTIVE, false),
    maxLogLines: numberFromEnv(env.DOCKER_MAX_LOG_LINES, 200),
  },
  git: {
    allowCommit: booleanFromEnv(env.GIT_ALLOW_COMMIT, false),
    allowedRoots: listFromEnv(env.GIT_ALLOWED_ROOTS, defaultAllowedRoots).map((entry) => path.resolve(entry)),
    defaultLogLimit: numberFromEnv(env.GIT_DEFAULT_LOG_LIMIT, 25),
  },
  notion: {
    token: env.NOTION_TOKEN || process.env.NOTION_TOKEN,
    allowWrite: booleanFromEnv(env.NOTION_ALLOW_WRITE, false),
  },
  database: {
    postgresUrl: env.POSTGRES_URL,
    allowWrite: booleanFromEnv(env.DATABASE_ALLOW_WRITE, false),
    queryTimeoutMs: numberFromEnv(env.DATABASE_QUERY_TIMEOUT_MS, 15_000),
    sqliteAllowedPaths: listFromEnv(env.SQLITE_ALLOWED_PATHS, []).map((entry) => path.resolve(entry)),
  },
  web: {
    allowedHosts: listFromEnv(env.WEB_ALLOWED_HOSTS, []),
    requestTimeoutMs: numberFromEnv(env.WEB_REQUEST_TIMEOUT_MS, 10_000),
  },
  system: {
    portScanLimit: numberFromEnv(env.SYSTEM_PORT_SCAN_LIMIT, 25),
  },
  desktop: {
    allowedProtocols: listFromEnv(env.DESKTOP_ALLOWED_PROTOCOLS, ["http", "https", "mailto", "ms-settings"]),
    allowedPathRoots: listFromEnv(env.DESKTOP_ALLOWED_PATH_ROOTS, defaultDesktopPathRoots).map((entry) => path.resolve(entry)),
    allowedAppRoots: listFromEnv(env.DESKTOP_ALLOWED_APP_ROOTS, defaultDesktopAppRoots).map((entry) => path.resolve(entry)),
    appAliases: keyValueMapFromEnv(env.DESKTOP_APP_ALIASES, defaultDesktopAliases),
  },
} as const;

export type HubConfig = typeof hubConfig;
