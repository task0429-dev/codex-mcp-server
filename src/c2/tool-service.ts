import { AgentId, ToolMetadata, ToolMetadataSchema } from "./contracts";
import { C2MemoryService } from "./memory-service";
import { C2MonitoringService } from "./monitoring-service";

type ToolExecutor = (input: any) => Promise<unknown>;

type ToolDefinition = ToolMetadata & {
  execute: ToolExecutor;
};

const ALL_AGENTS: AgentId[] = ["abdi", "dame", "ayub", "rex", "ahmed", "atlas", "prime", "sygma"];

export class C2ToolService {
  constructor(
    private readonly memory: C2MemoryService,
    private readonly monitoring: C2MonitoringService
  ) {}

  private tools(): ToolDefinition[] {
    return [
      {
        ...ToolMetadataSchema.parse({
          id: "monitoring.diagnose",
          displayName: "Monitoring Diagnose",
          description: "Fetch monitoring overview and health details.",
          category: "monitoring",
          inputSchema: { serviceId: { type: "string", optional: true } },
          outputSchema: { type: "object" },
          authRequired: false,
          rateLimitPerMinute: 120,
          executionMode: "sync",
          allowedAgents: ALL_AGENTS,
          auditEnabled: true,
          version: "1.0.0",
          destructive: false,
        }),
        execute: async (input: any) => {
          if (input?.serviceId) {
            return this.monitoring.getServiceDetail(String(input.serviceId));
          }
          return this.monitoring.getOverview();
        },
      },
      {
        ...ToolMetadataSchema.parse({
          id: "memory.search",
          displayName: "Memory Search",
          description: "Search indexed C2 memory records.",
          category: "memory_search",
          inputSchema: { q: { type: "string" }, limit: { type: "number", optional: true } },
          outputSchema: { type: "object" },
          authRequired: false,
          rateLimitPerMinute: 240,
          executionMode: "sync",
          allowedAgents: ALL_AGENTS,
          auditEnabled: true,
          version: "1.0.0",
          destructive: false,
        }),
        execute: async (input: any) => this.memory.search({ q: String(input?.q || ""), limit: Number(input?.limit || 20), cursor: 0 }),
      },
      {
        ...ToolMetadataSchema.parse({
          id: "workspace.echo",
          displayName: "Workspace Echo",
          description: "Dry-run command tool used for testing execution pipeline.",
          category: "command_execution",
          inputSchema: { message: { type: "string" } },
          outputSchema: { ok: { type: "boolean" }, echoed: { type: "string" } },
          authRequired: false,
          rateLimitPerMinute: 300,
          executionMode: "sync",
          allowedAgents: ALL_AGENTS,
          auditEnabled: true,
          version: "1.0.0",
          destructive: false,
        }),
        execute: async (input: any) => ({ ok: true, echoed: String(input?.message || ""), ts: new Date().toISOString() }),
      },
    ];
  }

  list() {
    return this.tools().map(({ execute: _execute, ...meta }) => meta);
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.tools().find((tool) => tool.id === toolId);
  }

  async execute(toolId: string, input: unknown): Promise<unknown> {
    const tool = this.get(toolId);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolId}`);
    }
    return tool.execute(input);
  }
}
