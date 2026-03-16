import { z } from "zod";
import { TerminalIntegration } from "./terminal";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";

const ListContainersSchema = z.object({
  agentName: z.string().describe("Agent requesting access"),
  all: z.boolean().optional().describe("Include stopped containers")
});

const InspectContainerSchema = z.object({
  containerId: z.string().describe("Container ID or name"),
  agentName: z.string().describe("Agent requesting access")
});

const GetContainerLogsSchema = z.object({
  containerId: z.string().describe("Container ID or name"),
  agentName: z.string().describe("Agent requesting access"),
  tail: z.number().optional().describe("Number of lines to tail")
});

const StartStopContainerSchema = z.object({
  containerId: z.string().describe("Container ID or name"),
  action: z.enum(["start", "stop", "restart"]).describe("Action to perform"),
  agentName: z.string().describe("Agent requesting access")
});

/**
 * Docker integration using Docker CLI with permission controls
 */
export class DockerIntegration {
  /**
   * Check if Docker is available
   */
  private static async isDockerAvailable(): Promise<boolean> {
    try {
      await TerminalIntegration.executeCommand({
        command: "docker",
        args: ["--version"],
        agentName: "system" // System check
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List Docker containers
   */
  static async listContainers(input: z.infer<typeof ListContainersSchema>) {
    const { agentName, all = false } = input;

    if (!AccessPolicy.hasPermission(agentName, "docker", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Docker`);
    }

    if (!(await this.isDockerAvailable())) {
      throw new Error("Docker is not available on this system");
    }

    try {
      const result = await TerminalIntegration.executeCommand({
        command: "docker",
        args: ["ps", all ? "-a" : "", "--format", "json"],
        agentName
      });

      // Parse JSON output
      const containers = result.stdout.split("\n")
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      logger.info(`Agent ${agentName} listed ${containers.length} Docker containers`);
      return { containers, count: containers.length };
    } catch (error) {
      logger.error(`Docker list error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Inspect a Docker container
   */
  static async inspectContainer(input: z.infer<typeof InspectContainerSchema>) {
    const { containerId, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "docker", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Docker`);
    }

    if (!(await this.isDockerAvailable())) {
      throw new Error("Docker is not available on this system");
    }

    try {
      const result = await TerminalIntegration.executeCommand({
        command: "docker",
        args: ["inspect", containerId],
        agentName
      });

      const inspection = JSON.parse(result.stdout);
      logger.info(`Agent ${agentName} inspected Docker container: ${containerId}`);
      return { container: inspection[0] };
    } catch (error) {
      logger.error(`Docker inspect error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Get container logs
   */
  static async getContainerLogs(input: z.infer<typeof GetContainerLogsSchema>) {
    const { containerId, agentName, tail = 100 } = input;

    if (!AccessPolicy.hasPermission(agentName, "docker", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Docker`);
    }

    if (!(await this.isDockerAvailable())) {
      throw new Error("Docker is not available on this system");
    }

    try {
      const result = await TerminalIntegration.executeCommand({
        command: "docker",
        args: ["logs", "--tail", tail.toString(), containerId],
        agentName
      });

      logger.info(`Agent ${agentName} retrieved logs for container: ${containerId}`);
      return {
        containerId,
        stdout: result.stdout,
        stderr: result.stderr
      };
    } catch (error) {
      logger.error(`Docker logs error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Start, stop, or restart a container
   */
  static async controlContainer(input: z.infer<typeof StartStopContainerSchema>) {
    const { containerId, action, agentName } = input;

    const requiredPermission = action === "start" ? "write" : "admin";
    if (!AccessPolicy.hasPermission(agentName, "docker", requiredPermission as any)) {
      throw new Error(`Agent ${agentName} does not have ${requiredPermission} permission for Docker`);
    }

    if (!(await this.isDockerAvailable())) {
      throw new Error("Docker is not available on this system");
    }

    try {
      const result = await TerminalIntegration.executeCommand({
        command: "docker",
        args: [action, containerId],
        agentName
      });

      logger.info(`Agent ${agentName} ${action}ed Docker container: ${containerId}`);
      return {
        success: true,
        action,
        containerId,
        output: result.stdout
      };
    } catch (error) {
      logger.error(`Docker ${action} error for ${agentName}: ${error}`);
      throw error;
    }
  }
}

// Tool definitions for MCP
export const dockerTools = [
  {
    name: "docker_list_containers",
    description: "List Docker containers with permission check",
    inputSchema: ListContainersSchema,
    handler: DockerIntegration.listContainers.bind(DockerIntegration)
  },
  {
    name: "docker_inspect_container",
    description: "Inspect a Docker container's configuration",
    inputSchema: InspectContainerSchema,
    handler: DockerIntegration.inspectContainer.bind(DockerIntegration)
  },
  {
    name: "docker_get_logs",
    description: "Get logs from a Docker container",
    inputSchema: GetContainerLogsSchema,
    handler: DockerIntegration.getContainerLogs.bind(DockerIntegration)
  },
  {
    name: "docker_control_container",
    description: "Start, stop, or restart a Docker container (requires appropriate permissions)",
    inputSchema: StartStopContainerSchema,
    handler: DockerIntegration.controlContainer.bind(DockerIntegration)
  }
];