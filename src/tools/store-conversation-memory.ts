import { randomUUID } from "crypto";
import { z } from "zod";
import { MemoryService } from "../services/memory-service";
import { memoryIngestionService } from "../memory/ingestion-service";

export const toolName = "store_conversation_memory";
export const toolDescription = "Store an external conversation in memory so it can be searched later";

const turnSchema = z.object({
  role: z.string().describe("Speaker role, e.g. user, assistant, system, agent"),
  text: z.string().describe("Message text"),
  speaker: z.string().optional().describe("Optional display speaker name"),
  timestamp: z.string().optional().describe("Optional ISO timestamp"),
});

export const inputSchema = z.object({
  name: z.string().describe("Agent name or memory namespace"),
  conversationId: z.string().optional().describe("Optional stable conversation ID"),
  source: z.string().optional().describe("Conversation source, e.g. codex, chatgpt, claude"),
  summary: z.string().optional().describe("Optional short summary"),
  tags: z.array(z.string()).optional().describe("Optional tags"),
  metadata: z.record(z.unknown()).optional().describe("Optional metadata"),
  turns: z.array(turnSchema).min(1).describe("Conversation turns in order"),
});

export interface StoreConversationMemoryOutput {
  success: boolean;
  namespace: string;
  conversationId: string;
  turnCount: number;
  file: string;
  timestamp: string;
}

export async function handler(input: unknown): Promise<StoreConversationMemoryOutput> {
  const parsed = inputSchema.parse(input);
  const timestamp = new Date().toISOString();
  const conversationId = parsed.conversationId || `conversation-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const source = parsed.source || "external";

  const record = {
    id: conversationId,
    source,
    namespace: parsed.name,
    summary: parsed.summary || null,
    tags: parsed.tags || [],
    metadata: parsed.metadata || {},
    turns: parsed.turns.map((turn) => ({
      ...turn,
      timestamp: turn.timestamp || timestamp,
    })),
    capturedAt: timestamp,
  };

  const stored = MemoryService.storeMemory(parsed.name, "conversations.jsonl", JSON.stringify(record));
  if (!stored) {
    throw new Error(`Failed to store conversation memory for ${parsed.name}`);
  }

  await memoryIngestionService.capture({
    sourceId: source === "codex" ? "codex_mcp_mirror" : "backfill_imports",
    sourceType: "conversation_import",
    captureMode: source === "codex" ? "mirror" : "import",
    sourceRecordId: `${parsed.name}:${conversationId}`,
    payload: record,
    eventTime: timestamp,
    orderingKey: timestamp,
    sourceTrustScore: source === "codex" ? 0.75 : 0.65,
    completenessScore: 0.8,
    segmentStatus: "complete",
    actor: {
      id: "store-conversation-memory",
      role: "agent_service_role",
    },
    actionReason: `Stored external conversation for ${parsed.name}`,
  });

  return {
    success: true,
    namespace: parsed.name,
    conversationId,
    turnCount: parsed.turns.length,
    file: "conversations.jsonl",
    timestamp,
  };
}
