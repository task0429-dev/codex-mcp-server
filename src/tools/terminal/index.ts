import { z } from "zod";
import { ToolDefinition } from "../../types/tool";
import { ToolError } from "../../utils/errors";
import { runSafeCommand } from "../../services/command-service";

const group = "terminal";

const ExecuteCommandSchema = z.object({
  command: z.string().min(1).describe("Executable command to run."),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional().describe("Working directory."),
  timeout_ms: z.number().int().min(1).max(300000).optional(),
  shell: z.boolean().optional().default(false).describe("Use shell execution only if enabled by config."),
  confirm: z.boolean().optional().default(false).describe("Must be true for clearly destructive commands."),
});

const suspiciousSubcommands = ["clean", "reset", "prune", "down", "stop"];

export const terminalTools: ToolDefinition[] = [
  {
    name: "terminal_execute_command",
    description: "Execute an allowlisted command with timeout, cwd, and output guardrails.",
    inputSchema: ExecuteCommandSchema,
    group,
    handler: async (input) => {
      const normalizedCommand = input.command.toLowerCase();
      const joinedArgs = input.args.join(" ").toLowerCase();
      const looksDestructive =
        normalizedCommand === "rm" ||
        normalizedCommand === "del" ||
        suspiciousSubcommands.some((entry) => joinedArgs.includes(entry));

      if (looksDestructive && !input.confirm) {
        throw new ToolError("This command looks destructive. Re-run with confirm=true if you really want it.", {
          code: "bad_request",
          statusCode: 400,
        });
      }

      return runSafeCommand({
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        timeoutMs: input.timeout_ms,
        shell: input.shell,
      });
    },
  },
];
