import { z } from "zod";
import { AgentRegistry } from "../registry/agents";
import { SessionService } from "../services/session-service";
import { UNLOCK_ALLOWLIST } from "../config";
import { LogService } from "../services/log-service";

export const toolName = "unlock_session";
export const toolDescription = "Safely clear stale session locks (restricted)";
export const inputSchema = z.object({
  name: z.string().describe("Agent name"),
  sessionFile: z.string().describe("Session/lock filename"),
});

export interface UnlockSessionInput {
  name: string;
  sessionFile: string;
}

export interface UnlockSessionOutput {
  agent: string;
  success: boolean;
  message: string;
  timestamp: string;
}

export async function handler(input: unknown): Promise<UnlockSessionOutput> {
  const parsed = inputSchema.parse(input);
  const { name, sessionFile } = parsed;

  const agent = AgentRegistry.find(name);
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`);
  }

  // CRITICAL SAFETY CHECK: Only approved agents can unlock sessions
  if (!UNLOCK_ALLOWLIST.includes(agent.name)) {
    const error = `Agent ${agent.name} is not in unlock allowlist. Only these agents can unlock: ${UNLOCK_ALLOWLIST.join(", ")}`;
    LogService.appendLog(name, `UNLOCK DENIED: ${error}`);
    throw new Error(error);
  }

  // Check if agent supports unlock
  if (!agent.allowedActions.includes("unlock")) {
    throw new Error(`Agent ${agent.name} does not support unlock action`);
  }

  // Perform unlock with safety checks (only stale locks, never active ones)
  const result = SessionService.unlockSession(name, sessionFile);

  if (result.success) {
    LogService.appendLog(name, `UNLOCK: ${result.message}`);
  }

  return {
    agent: agent.name,
    success: result.success,
    message: result.message,
    timestamp: new Date().toISOString(),
  };
}
