import { z } from "zod";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";

const ExecuteCommandSchema = z.object({
  command: z.string().describe("Command to execute"),
  args: z.array(z.string()).optional().describe("Command arguments"),
  cwd: z.string().optional().describe("Working directory"),
  agentName: z.string().describe("Agent requesting execution")
});

export class TerminalIntegration {
  static async executeCommand(input: z.infer<typeof ExecuteCommandSchema>) {
    const { command, args = [], cwd, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "terminal", "execute")) {
      throw new Error(`Agent ${agentName} does not have execute permission for terminal`);
    }

    if (!AccessPolicy.isCommandAllowed(agentName, command)) {
      throw new Error(`Command '${command}' is not allowed for agent ${agentName}`);
    }

    const maxTimeSeconds = AccessPolicy.getMaxExecutionTime(agentName);

    try {
      logger.info(`Agent ${agentName} executing command: ${command} ${args.join(" ")}`);
      const result = await this.runCommand(command, args, cwd || process.cwd(), maxTimeSeconds);
      logger.info(`Command completed for ${agentName}: exit code ${result.exitCode}`);
      return result;
    } catch (error) {
      logger.error(`Command execution failed for ${agentName}: ${error}`);
      throw error;
    }
  }

  private static runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeoutSeconds: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        shell: true,
        stdio: "pipe",
        env: process.env,
      }) as ChildProcessWithoutNullStreams;

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }, timeoutSeconds * 1000);

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`Command timed out after ${timeoutSeconds} seconds`));
        } else {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? 0
          });
        }
      });

      child.on("error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}

export const terminalTools = [
  {
    name: "terminal_execute_command",
    description: "Execute a terminal command with permission checks and security controls",
    inputSchema: ExecuteCommandSchema,
    handler: TerminalIntegration.executeCommand.bind(TerminalIntegration)
  }
];
