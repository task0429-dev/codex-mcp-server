import crypto from "crypto";
import { ExecutionCreateInput, ExecutionRecord, ExecutionRecordSchema } from "./contracts";
import { readJsonFile, writeJsonFile } from "./store";
import { C2MemoryService } from "./memory-service";
import { C2ToolService } from "./tool-service";

type ExecutionState = {
  executions: ExecutionRecord[];
};

function nowIso() {
  return new Date().toISOString();
}

function readState(): ExecutionState {
  return readJsonFile<ExecutionState>("executions.json", { executions: [] });
}

function writeState(state: ExecutionState) {
  writeJsonFile("executions.json", state);
}

function classifyFailure(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("timeout") || normalized.includes("abort")) return "timeout";
  if (normalized.includes("permission") || normalized.includes("forbidden")) return "authorization";
  if (normalized.includes("not found") || normalized.includes("unknown")) return "missing_dependency";
  return "execution_error";
}

export class C2ExecutionService {
  constructor(
    private readonly tools: C2ToolService,
    private readonly memory: C2MemoryService
  ) {}

  list() {
    return readState().executions.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  get(executionId: string) {
    return this.list().find((record) => record.id === executionId);
  }

  private save(record: ExecutionRecord) {
    const state = readState();
    const index = state.executions.findIndex((entry) => entry.id === record.id);
    if (index >= 0) {
      state.executions[index] = record;
    } else {
      state.executions.unshift(record);
      state.executions = state.executions.slice(0, 300);
    }
    writeState(state);
    return record;
  }

  async create(input: ExecutionCreateInput) {
    const tool = this.tools.get(input.toolId);
    if (!tool) {
      throw new Error(`Unknown tool: ${input.toolId}`);
    }
    if (!tool.allowedAgents.includes(input.agentId)) {
      throw new Error(`Agent ${input.agentId} is not allowed to use ${input.toolId}`);
    }

    const record = ExecutionRecordSchema.parse({
      id: crypto.randomUUID(),
      toolId: tool.id,
      toolName: tool.displayName,
      agentId: input.agentId,
      intent: input.intent,
      projectId: input.projectId || null,
      correlationId: input.correlationId || null,
      priority: input.priority,
      status: "queued",
      payload: input.payload,
      result: null,
      error: null,
      failureClass: null,
      createdAt: nowIso(),
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      retries: 0,
      timeoutMs: null,
    });
    this.save(record);

    await this.memory.record({
      source: "execution",
      kind: "execution_created",
      severity: "info",
      summary: `${tool.displayName} queued`,
      detail: input.intent,
      agentId: input.agentId,
      projectId: input.projectId || null,
      tags: ["execution", tool.id, input.priority],
      correlationId: input.correlationId || null,
      metadata: { executionId: record.id, toolId: tool.id },
    });

    if (!input.async) {
      return this.run(record.id);
    }

    return this.get(record.id);
  }

  async run(executionId: string) {
    const current = this.get(executionId);
    if (!current) {
      throw new Error(`Unknown execution: ${executionId}`);
    }
    if (current.status === "canceled") {
      return current;
    }

    const running = this.save({
      ...current,
      status: "running",
      startedAt: nowIso(),
    });

    try {
      const result = await this.tools.execute(running.toolId, {
        ...running.payload,
        agentName: running.agentId[0].toUpperCase() + running.agentId.slice(1),
        agentId: running.agentId,
      });

      const completed = this.save({
        ...running,
        status: "completed",
        result,
        completedAt: nowIso(),
      });

      await this.memory.record({
        source: "execution",
        kind: "execution_completed",
        severity: "info",
        summary: `${running.toolName} completed`,
        detail: running.intent,
        agentId: running.agentId,
        projectId: running.projectId,
        tags: ["execution", "completed", running.toolId],
        correlationId: running.correlationId,
        metadata: { executionId: running.id, toolId: running.toolId, resultPreview: JSON.stringify(result).slice(0, 500) },
      });

      return completed;
    } catch (error: any) {
      const message = error?.message || String(error);
      const failed = this.save({
        ...running,
        status: message.toLowerCase().includes("timeout") ? "timed_out" : "failed",
        error: message,
        failureClass: classifyFailure(message),
        completedAt: nowIso(),
      });

      await this.memory.record({
        source: "execution",
        kind: "execution_failed",
        severity: "error",
        summary: `${running.toolName} failed`,
        detail: message,
        agentId: running.agentId,
        projectId: running.projectId,
        tags: ["execution", "failed", running.toolId],
        correlationId: running.correlationId,
        metadata: { executionId: running.id, toolId: running.toolId, failureClass: failed.failureClass },
      });

      return failed;
    }
  }

  async cancel(executionId: string) {
    const current = this.get(executionId);
    if (!current) {
      throw new Error(`Unknown execution: ${executionId}`);
    }
    if (!["queued", "running"].includes(current.status)) {
      return current;
    }

    const canceled = this.save({
      ...current,
      status: "canceled",
      canceledAt: nowIso(),
      completedAt: nowIso(),
    });

    await this.memory.record({
      source: "execution",
      kind: "execution_canceled",
      severity: "warning",
      summary: `${current.toolName} canceled`,
      detail: current.intent,
      agentId: current.agentId,
      projectId: current.projectId,
      tags: ["execution", "canceled", current.toolId],
      correlationId: current.correlationId,
      metadata: { executionId: current.id, toolId: current.toolId },
    });

    return canceled;
  }
}
