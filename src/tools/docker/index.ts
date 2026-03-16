import { z } from "zod";
import { hubConfig } from "../../config/hub-config";
import { runSafeCommand } from "../../services/command-service";
import { ToolDefinition } from "../../types/tool";
import { ToolError, assertCondition } from "../../utils/errors";

const group = "docker";

const ListContainersSchema = z.object({
  all: z.boolean().optional().default(false),
});

const InspectContainerSchema = z.object({
  container: z.string().min(1),
});

const GetLogsSchema = z.object({
  container: z.string().min(1),
  tail: z.number().int().min(1).max(hubConfig.docker.maxLogLines).optional().default(100),
});

const ControlContainerSchema = z.object({
  container: z.string().min(1),
  action: z.enum(["start", "stop", "restart"]),
  confirm: z.boolean().optional().default(false),
});

const ComposeActionSchema = z.object({
  cwd: z.string().optional().describe("Directory containing docker-compose.yml or compose.yaml."),
  file: z.string().optional().describe("Optional compose file path."),
  action: z.enum(["ps", "logs", "up", "down", "restart", "config"]),
  services: z.array(z.string()).optional().default([]),
  follow: z.boolean().optional().default(false),
  confirm: z.boolean().optional().default(false),
});

async function checkDockerAvailable() {
  const version = await runSafeCommand({ command: "docker", args: ["--version"] });
  if (version.exitCode !== 0) {
    throw new ToolError("Docker CLI is not available.", {
      code: "dependency_missing",
      statusCode: 503,
      details: version,
    });
  }
}

function requireConfirmation(action: string, confirm: boolean) {
  if (hubConfig.docker.requireConfirmation && !confirm) {
    throw new ToolError(`${action} requires confirm=true.`, {
      code: "bad_request",
      statusCode: 400,
    });
  }
}

export const dockerTools: ToolDefinition[] = [
  {
    name: "docker_list_containers",
    description: "List running or all Docker containers.",
    inputSchema: ListContainersSchema,
    group,
    handler: async (input) => {
      await checkDockerAvailable();
      const result = await runSafeCommand({
        command: "docker",
        args: ["ps", ...(input.all ? ["-a"] : []), "--format", "{{json .}}"],
      });
      const containers = result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return { count: containers.length, containers };
    },
  },
  {
    name: "docker_inspect_container",
    description: "Inspect a single Docker container.",
    inputSchema: InspectContainerSchema,
    group,
    handler: async (input) => {
      await checkDockerAvailable();
      const result = await runSafeCommand({ command: "docker", args: ["inspect", input.container] });
      return { container: JSON.parse(result.stdout)[0] };
    },
  },
  {
    name: "docker_get_logs",
    description: "Fetch logs from a Docker container.",
    inputSchema: GetLogsSchema,
    group,
    handler: async (input) => {
      await checkDockerAvailable();
      const result = await runSafeCommand({
        command: "docker",
        args: ["logs", "--tail", String(input.tail), input.container],
      });
      return { container: input.container, stdout: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: "docker_control_container",
    description: "Start, stop, or restart a Docker container with confirmation.",
    inputSchema: ControlContainerSchema,
    group,
    destructive: true,
    handler: async (input) => {
      await checkDockerAvailable();
      if (input.action !== "start") {
        assertCondition(hubConfig.docker.allowDestructive, "Destructive Docker controls are disabled by policy.", {
          code: "permission_denied",
          statusCode: 403,
        });
      }
      requireConfirmation(`docker ${input.action}`, input.confirm);
      const result = await runSafeCommand({ command: "docker", args: [input.action, input.container] });
      return { action: input.action, container: input.container, output: result.stdout || result.stderr };
    },
  },
  {
    name: "docker_compose_action",
    description: "Run safe Docker Compose helper actions.",
    inputSchema: ComposeActionSchema,
    group,
    destructive: true,
    handler: async (input) => {
      await checkDockerAvailable();
      const args = ["compose"];
      if (input.file) {
        args.push("-f", input.file);
      }
      args.push(input.action);
      if (input.action === "logs" && input.follow) {
        args.push("-f");
      }
      if ((input.action === "up" || input.action === "down" || input.action === "restart") && !hubConfig.docker.allowDestructive) {
        throw new ToolError("Destructive Docker Compose actions are disabled by policy.", {
          code: "permission_denied",
          statusCode: 403,
        });
      }
      if (input.action === "up") {
        args.push("-d");
      }
      if (input.action === "up" || input.action === "down" || input.action === "restart") {
        requireConfirmation(`docker compose ${input.action}`, input.confirm);
      }
      args.push(...input.services);
      return runSafeCommand({
        command: "docker",
        args,
        cwd: input.cwd,
        timeoutMs: input.action === "logs" && input.follow ? 120000 : undefined,
      });
    },
  },
  {
    name: "docker_list_images",
    description: "List Docker images available locally.",
    inputSchema: z.object({}),
    group,
    handler: async () => {
      await checkDockerAvailable();
      const result = await runSafeCommand({ command: "docker", args: ["images", "--format", "{{json .}}"] });
      const images = result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return { count: images.length, images };
    },
  },
  {
    name: "docker_container_health",
    description: "Inspect the current health status of a container.",
    inputSchema: InspectContainerSchema,
    group,
    handler: async (input) => {
      await checkDockerAvailable();
      const result = await runSafeCommand({
        command: "docker",
        args: ["inspect", "--format", "{{json .State.Health}}", input.container],
      });
      return {
        container: input.container,
        health: result.stdout ? JSON.parse(result.stdout) : null,
      };
    },
  },
];
