import crypto from "crypto";
import WebSocket from "ws";

type SessionTranscriptEntry = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  final: boolean;
};

type VoiceSession = {
  id: string;
  participants: Array<{ id: string; name: string; role: string }>;
  createdAt: string;
  updatedAt: string;
  activeSpeakerId: string | null;
  queue: Array<{ id: string; name: string }>;
  transcript: SessionTranscriptEntry[];
  metrics: {
    timeToFirstSpeechMs: number | null;
    lastTurnLatencyMs: number | null;
    tokensPerSecond: number;
    lastPlaybackState: string;
  };
};

type SessionClientMessage =
  | { type: "join_session"; sessionId: string }
  | { type: "operator_utterance"; sessionId: string; text: string }
  | { type: "playback_state"; sessionId: string; state: string };

class RealtimeVoiceOrchestrator {
  private readonly sessions = new Map<string, VoiceSession>();
  private readonly sessionClients = new Map<string, Set<WebSocket>>();

  createSession(participantIds: string[]): VoiceSession {
    const id = crypto.randomUUID();
    const participants = participantIds.map((agentId) => ({
      id: agentId,
      name: agentId.charAt(0).toUpperCase() + agentId.slice(1),
      role: "agent",
    }));

    const session: VoiceSession = {
      id,
      participants,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeSpeakerId: null,
      queue: participants.map((p) => ({ id: p.id, name: p.name })),
      transcript: [],
      metrics: {
        timeToFirstSpeechMs: null,
        lastTurnLatencyMs: null,
        tokensPerSecond: 0,
        lastPlaybackState: "idle",
      },
    };

    this.sessions.set(id, session);
    return session;
  }

  snapshot(sessionId: string): VoiceSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Unknown voice session.");
    }
    return session;
  }

  currentControlSnapshot(): VoiceSession | null {
    return Array.from(this.sessions.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null;
  }

  attachClient(ws: WebSocket, sessionId: string): void {
    const session = this.snapshot(sessionId);
    const clients = this.sessionClients.get(sessionId) || new Set<WebSocket>();
    clients.add(ws);
    this.sessionClients.set(sessionId, clients);
    ws.send(JSON.stringify({ type: "session_snapshot", session }));
  }

  detachClient(ws: WebSocket): void {
    for (const [sessionId, clients] of this.sessionClients.entries()) {
      if (clients.delete(ws) && clients.size === 0) {
        this.sessionClients.delete(sessionId);
      }
    }
  }

  async handleMessage(ws: WebSocket, message: SessionClientMessage): Promise<void> {
    if (message.type === "join_session") {
      this.attachClient(ws, message.sessionId);
      return;
    }
    if (message.type === "operator_utterance") {
      await this.handleOperatorUtterance(message.sessionId, message.text);
      return;
    }
    if (message.type === "playback_state") {
      const session = this.snapshot(message.sessionId);
      session.metrics.lastPlaybackState = message.state;
      session.updatedAt = new Date().toISOString();
      this.broadcast(session.id, { type: "playback_state", state: message.state });
    }
  }

  async handleOperatorUtterance(sessionId: string, text: string): Promise<void> {
    const session = this.snapshot(sessionId);
    const ts = new Date().toISOString();

    session.transcript.push({
      id: crypto.randomUUID(),
      speaker: "operator",
      text,
      timestamp: ts,
      final: true,
    });

    const fallbackAgent = session.participants[0]?.name || "Assistant";
    const reply = `${fallbackAgent} acknowledged: ${text}`;

    session.transcript.push({
      id: crypto.randomUUID(),
      speaker: fallbackAgent,
      text: reply,
      timestamp: new Date().toISOString(),
      final: true,
    });

    session.activeSpeakerId = session.participants[0]?.id || null;
    session.updatedAt = new Date().toISOString();
    this.broadcast(session.id, { type: "session_snapshot", session });
  }

  private broadcast(sessionId: string, payload: unknown) {
    const clients = this.sessionClients.get(sessionId);
    if (!clients?.size) return;

    const serialized = JSON.stringify(payload);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    });
  }
}

export const realtimeVoiceOrchestrator = new RealtimeVoiceOrchestrator();
