import { createHash, randomUUID } from "crypto";
import { logger } from "../core/logger";
import { MemoryRepository } from "./repository";
import { MemoryAccessContext } from "./access-policy";

interface CaptureEnvelope {
  sourceId: string;
  sourceType: string;
  captureMode: string;
  sourceRecordId: string;
  payload: Record<string, unknown>;
  eventTime?: string;
  orderingKey?: string;
  sourceMutability?: string;
  sourceTrustScore?: number;
  completenessScore?: number;
  segmentStatus?: "complete" | "partial" | "fragmented";
  actor?: {
    id: string;
    role: string;
  };
  actionReason?: string;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function normalizeScore(value: number | undefined, fallback: number): number {
  const v = typeof value === "number" ? value : fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return Number(v.toFixed(3));
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}...[truncated ${value.length - maxChars} chars]`;
}

export class MemoryIngestionService {
  private bootstrapDone = false;

  private async bootstrap(): Promise<void> {
    if (this.bootstrapDone) {
      return;
    }
    await MemoryRepository.ensureSourceRegistry();
    this.bootstrapDone = true;
  }

  async capture(envelope: CaptureEnvelope): Promise<void> {
    try {
      await this.bootstrap();

      const sourceInfo = MemoryRepository.getSourceById(envelope.sourceId);
      const payloadText = stableStringify(envelope.payload);
      const payloadHash = createHash("sha256").update(payloadText).digest("hex");

      await MemoryRepository.insertSourceRecord({
        sourceId: envelope.sourceId,
        sourceType: envelope.sourceType,
        captureMode: envelope.captureMode,
        sourceRecordId: envelope.sourceRecordId,
        payloadJson: envelope.payload,
        payloadHash,
        eventTime: envelope.eventTime || null,
        orderingKey: envelope.orderingKey || null,
        sourceMutability: envelope.sourceMutability || sourceInfo?.mutable || "immutable",
        sourceTrustScore: normalizeScore(envelope.sourceTrustScore, sourceInfo?.completenessHint || 0.5),
        completenessScore: normalizeScore(envelope.completenessScore, sourceInfo?.completenessHint || 0.5),
        segmentStatus: envelope.segmentStatus || "complete",
      });

      await MemoryRepository.appendAuditLog({
        actorId: envelope.actor?.id || "memory-ingestion-service",
        actorRole: envelope.actor?.role || "agent_service_role",
        action: "ingest_source_record",
        targetType: "source_record",
        targetId: envelope.sourceRecordId,
        reason: envelope.actionReason || `Captured ${envelope.sourceId}`,
        requestId: `mem_audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        details: {
          sourceId: envelope.sourceId,
          sourceType: envelope.sourceType,
          captureMode: envelope.captureMode,
        },
      });
    } catch (err: any) {
      logger.warn("memory_ingest_capture_failed", {
        sourceId: envelope.sourceId,
        sourceRecordId: envelope.sourceRecordId,
        message: err?.message || String(err),
      });
    }
  }

  async captureMissionControlAction(action: string, payload: Record<string, unknown>, event?: Record<string, unknown>): Promise<void> {
    await this.capture({
      sourceId: "c2_internal_actions",
      sourceType: "c2_actions",
      captureMode: "live",
      sourceRecordId: `mission-control:${action}:${Date.now()}:${randomUUID().slice(0, 8)}`,
      payload: {
        action,
        payload,
        event: event || null,
      },
      eventTime: new Date().toISOString(),
      sourceTrustScore: 0.92,
      completenessScore: 0.9,
      segmentStatus: "complete",
      actor: {
        id: "mission-control",
        role: "agent_service_role",
      },
      actionReason: "Mission control action mirrored to memory bus",
    });
  }

  async captureMcpToolCall(transport: "http" | "stdio", toolName: string, args: unknown, status: "success" | "error", requestId: string, errorMessage?: string): Promise<void> {
    await this.capture({
      sourceId: "mcp_tool_events",
      sourceType: "mcp",
      captureMode: "live",
      sourceRecordId: `${transport}:${requestId}:${toolName}`,
      payload: {
        transport,
        toolName,
        status,
        error: errorMessage || null,
        argsPreview: truncateText(JSON.stringify(args || {}), 2000),
      },
      eventTime: new Date().toISOString(),
      orderingKey: `${Date.now()}`,
      sourceTrustScore: 0.95,
      completenessScore: 0.95,
      segmentStatus: "complete",
      actor: {
        id: `mcp-${transport}`,
        role: "agent_service_role",
      },
      actionReason: `MCP tool call (${transport}) mirrored to memory bus`,
    });
  }

  async captureAgentChat(channel: "voice" | "messages", requestPayload: Record<string, unknown>, responsePayload: Record<string, unknown>): Promise<void> {
    const sourceId = channel === "voice" ? "c2_chat_messages" : "c2_chat_messages";
    await this.capture({
      sourceId,
      sourceType: channel === "voice" ? "c2_voice" : "c2_chat",
      captureMode: "live",
      sourceRecordId: `${channel}:${Date.now()}:${randomUUID().slice(0, 8)}`,
      payload: {
        channel,
        request: requestPayload,
        response: responsePayload,
      },
      eventTime: new Date().toISOString(),
      orderingKey: `${Date.now()}`,
      sourceTrustScore: 0.88,
      completenessScore: 0.85,
      segmentStatus: "complete",
      actor: {
        id: `c2-${channel}`,
        role: "agent_service_role",
      },
      actionReason: `C2 ${channel} interaction captured`,
    });
  }

  async captureFromPolicyContext(context: MemoryAccessContext, action: string, details: Record<string, unknown>): Promise<void> {
    await this.capture({
      sourceId: "c2_internal_actions",
      sourceType: "c2_policy_event",
      captureMode: "live",
      sourceRecordId: `policy:${action}:${Date.now()}:${randomUUID().slice(0, 8)}`,
      payload: {
        action,
        details,
      },
      eventTime: new Date().toISOString(),
      sourceTrustScore: 0.9,
      completenessScore: 0.9,
      segmentStatus: "complete",
      actor: {
        id: context.actorId,
        role: context.role,
      },
      actionReason: "Policy-governed memory API event",
    });
  }
}

export const memoryIngestionService = new MemoryIngestionService();