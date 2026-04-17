export type SourceReliabilityTier = "high" | "medium" | "low" | "inaccessible";
export type SourceCaptureMode = "live" | "mirror" | "import" | "unsupported";
export type SourceMutability = "immutable" | "mutable_upstream" | "mutable_client";

export interface SourceRegistryEntry {
  id: string;
  name: string;
  sourceType: string;
  captureMode: SourceCaptureMode;
  rawOrMirror: "raw" | "mirror" | "imported" | "n/a";
  reliabilityTier: SourceReliabilityTier;
  completenessHint: number;
  orderingTrustHint: number;
  mutable: SourceMutability;
  inaccessibleNative: boolean;
}

export const DEFAULT_SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    id: "mcp_tool_events",
    name: "MCP Tool/Event Stream",
    sourceType: "mcp",
    captureMode: "live",
    rawOrMirror: "raw",
    reliabilityTier: "high",
    completenessHint: 0.95,
    orderingTrustHint: 0.95,
    mutable: "immutable",
    inaccessibleNative: false,
  },
  {
    id: "c2_internal_actions",
    name: "C2 Internal Actions",
    sourceType: "c2_actions",
    captureMode: "live",
    rawOrMirror: "raw",
    reliabilityTier: "high",
    completenessHint: 0.9,
    orderingTrustHint: 0.9,
    mutable: "mutable_upstream",
    inaccessibleNative: false,
  },
  {
    id: "c2_chat_messages",
    name: "C2 Chat Endpoints",
    sourceType: "c2_chat",
    captureMode: "live",
    rawOrMirror: "raw",
    reliabilityTier: "high",
    completenessHint: 0.85,
    orderingTrustHint: 0.9,
    mutable: "immutable",
    inaccessibleNative: false,
  },
  {
    id: "agent_agent_mirror",
    name: "Agent to Agent Mirror",
    sourceType: "agent_agent",
    captureMode: "mirror",
    rawOrMirror: "mirror",
    reliabilityTier: "medium",
    completenessHint: 0.7,
    orderingTrustHint: 0.7,
    mutable: "immutable",
    inaccessibleNative: false,
  },
  {
    id: "telegram_bridge",
    name: "Telegram Bridge",
    sourceType: "telegram",
    captureMode: "live",
    rawOrMirror: "raw",
    reliabilityTier: "medium",
    completenessHint: 0.75,
    orderingTrustHint: 0.8,
    mutable: "mutable_upstream",
    inaccessibleNative: false,
  },
  {
    id: "codex_mcp_mirror",
    name: "Codex MCP Mirror",
    sourceType: "codex_mirror",
    captureMode: "mirror",
    rawOrMirror: "mirror",
    reliabilityTier: "medium",
    completenessHint: 0.6,
    orderingTrustHint: 0.65,
    mutable: "immutable",
    inaccessibleNative: false,
  },
  {
    id: "claude_mcp_mirror",
    name: "Claude MCP Mirror",
    sourceType: "claude_mirror",
    captureMode: "mirror",
    rawOrMirror: "mirror",
    reliabilityTier: "medium",
    completenessHint: 0.6,
    orderingTrustHint: 0.65,
    mutable: "immutable",
    inaccessibleNative: false,
  },
  {
    id: "backfill_imports",
    name: "Backfill Imports",
    sourceType: "import",
    captureMode: "import",
    rawOrMirror: "imported",
    reliabilityTier: "medium",
    completenessHint: 0.5,
    orderingTrustHint: 0.5,
    mutable: "mutable_upstream",
    inaccessibleNative: false,
  },
  {
    id: "legacy_file_logs",
    name: "Legacy File Logs",
    sourceType: "legacy_logs",
    captureMode: "mirror",
    rawOrMirror: "mirror",
    reliabilityTier: "low",
    completenessHint: 0.4,
    orderingTrustHint: 0.45,
    mutable: "mutable_upstream",
    inaccessibleNative: false,
  },
  {
    id: "browser_local_voice",
    name: "Browser Local Voice Logs",
    sourceType: "browser_local",
    captureMode: "import",
    rawOrMirror: "imported",
    reliabilityTier: "low",
    completenessHint: 0.35,
    orderingTrustHint: 0.4,
    mutable: "mutable_client",
    inaccessibleNative: false,
  },
  {
    id: "native_platform_history",
    name: "Native Platform History (Unavailable)",
    sourceType: "native_unavailable",
    captureMode: "unsupported",
    rawOrMirror: "n/a",
    reliabilityTier: "inaccessible",
    completenessHint: 0,
    orderingTrustHint: 0,
    mutable: "immutable",
    inaccessibleNative: true,
  },
];