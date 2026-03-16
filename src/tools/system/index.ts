import os from "os";
import { z } from "zod";
import { ToolDefinition } from "../../types/tool";
import { runSafeCommand } from "../../services/command-service";
import { hubConfig } from "../../config/hub-config";

const group = "system";

const PortCheckSchema = z.object({
  port: z.number().int().min(1).max(65535),
});

const DiagnosticsSchema = z.object({
  cwd: z.string().optional(),
});

export const systemTools: ToolDefinition[] = [
  {
    name: "system_os_info",
    description: "Return core operating system details.",
    inputSchema: z.object({}),
    group,
    handler: async () => ({
      platform: process.platform,
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime_seconds: os.uptime(),
      cpus: os.cpus().length,
      total_memory_bytes: os.totalmem(),
      free_memory_bytes: os.freemem(),
      user_home: os.homedir(),
      temp_dir: os.tmpdir(),
    }),
  },
  {
    name: "system_resource_summary",
    description: "Return a compact summary of memory, load, and network interfaces.",
    inputSchema: z.object({}),
    group,
    handler: async () => ({
      memory: {
        total_bytes: os.totalmem(),
        free_bytes: os.freemem(),
      },
      load_average: os.loadavg(),
      network_interfaces: os.networkInterfaces(),
    }),
  },
  {
    name: "system_port_usage_check",
    description: "Check whether a specific TCP port appears to be in use.",
    inputSchema: PortCheckSchema,
    group,
    handler: async (input) => {
      const command = process.platform === "win32" ? "netstat" : "ss";
      const args = process.platform === "win32" ? ["-ano"] : ["-ltnp"];
      const result = await runSafeCommand({
        command,
        args,
        timeoutMs: 15000,
      });
      const matches = result.stdout
        .split(/\r?\n/)
        .filter((line) => line.includes(`:${input.port}`))
        .slice(0, hubConfig.system.portScanLimit);
      return { port: input.port, in_use: matches.length > 0, matches };
    },
  },
  {
    name: "system_environment_diagnostics",
    description: "Show runtime diagnostics useful for local development workflows.",
    inputSchema: DiagnosticsSchema,
    group,
    handler: async (input) => {
      const cwd = input.cwd;
      const [nodeVersion, gitVersion] = await Promise.all([
        runSafeCommand({ command: "node", args: ["--version"], cwd }),
        runSafeCommand({ command: "git", args: ["--version"], cwd }),
      ]);
      return {
        platform: process.platform,
        cwd: cwd || hubConfig.projectRoot,
        node: nodeVersion.stdout,
        git: gitVersion.stdout,
        pid: process.pid,
      };
    },
  },
  {
    name: "system_health_snapshot",
    description: "Return a quick health snapshot for the MCP host environment.",
    inputSchema: z.object({}),
    group,
    handler: async () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
      platform: process.platform,
      uptime_seconds: process.uptime(),
      memory_usage: process.memoryUsage(),
    }),
  },
];
