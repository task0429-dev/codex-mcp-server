import { AgentRegistry as MetadataRegistry } from "../agents/agents";
import { AccessPolicy } from "../policies/policies";
import { SessionService } from "../services/session-service";
import { AgentId, AgentRecord } from "./contracts";
import { readJsonFile, writeJsonFile } from "./store";
import { C2ExecutionService } from "./execution-service";
import { C2MemoryService } from "./memory-service";
import { C2ToolService } from "./tool-service";

type AgentHeartbeatState = Record<string, { heartbeatAt: string; status: AgentRecord["status"] }>;

function readHeartbeats(): AgentHeartbeatState {
  return readJsonFile<AgentHeartbeatState>("agent-heartbeats.json", {});
}

function writeHeartbeats(state: AgentHeartbeatState) {
  writeJsonFile("agent-heartbeats.json", state);
}

const normalizedIdMap = new Map(
  MetadataRegistry.list().map((agent) => [agent.name.toLowerCase(), agent.name.toLowerCase() as AgentId])
);

export class C2AgentService {
  constructor(
    private readonly tools: C2ToolService,
    private readonly executions: C2ExecutionService,
    private readonly memory: C2MemoryService
  ) {}

  list(): AgentRecord[] {
    const heartbeats = readHeartbeats();
    const tools = this.tools.list();
    const executionHistory = this.executions.list();

    return MetadataRegistry.list().map((agent) => {
      const agentId = normalizedIdMap.get(agent.name.toLowerCase())!;
      const heartbeat = heartbeats[agentId];
      const policy = AccessPolicy.getPolicy(agent.name);
      const sessions = SessionService.listSessions(agent.name);
      const latestExecution = executionHistory.find((entry) => entry.agentId === agentId);

      return {
        id: agentId,
        name: agent.name,
        role: agent.role,
        description: agent.description,
        permissions: Object.entries(policy?.permissions || {}).map(([integration, level]) => ({ integration, level })),
        toolAccess: tools.filter((tool) => tool.allowedAgents.includes(agentId)).map((tool) => tool.id),
        memoryScope: [agentId, "task-enterprise-c2", "mission-control"],
        status: heartbeat?.status || (latestExecution?.status === "failed" ? "degraded" : "online"),
        heartbeatAt: heartbeat?.heartbeatAt || null,
        activeSessionCount: sessions.length,
        lastActivityAt: latestExecution?.completedAt || latestExecution?.createdAt || heartbeat?.heartbeatAt || null,
      };
    });
  }

  get(agentId: AgentId) {
    return this.list().find((agent) => agent.id === agentId);
  }

  async heartbeat(agentId: AgentId, status: AgentRecord["status"]) {
    const state = readHeartbeats();
    state[agentId] = {
      heartbeatAt: new Date().toISOString(),
      status,
    };
    writeHeartbeats(state);

    await this.memory.record({
      source: "agent",
      kind: "heartbeat",
      severity: status === "online" ? "info" : status === "degraded" ? "warning" : "error",
      summary: `${agentId} heartbeat`,
      detail: `Agent ${agentId} updated status to ${status}.`,
      agentId,
      projectId: "task-enterprise-c2",
      tags: ["agent", "heartbeat", status],
      correlationId: null,
      metadata: { agentId, status },
    });

    return this.get(agentId);
  }
}
