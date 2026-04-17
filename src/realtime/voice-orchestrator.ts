import { randomUUID } from "crypto";
import WebSocket from "ws";
import { AgentRegistry } from "../registry/agents";
import { buildRealtimeConversationPrompt } from "../core/conversation-engine";
import { TurnManager, TurnRequest } from "../core/turn-manager";
import { SpeechQueue } from "../core/speech-queue";
import { TokenBuffer } from "../streaming/token-buffer";
import { createTtsStreamChunk } from "../voice/tts-stream";
import { streamAgentTurn } from "../agents/runtime/voice-runtime";
import { MissionControlStateService } from "../services/mission-control-state-service";

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

type VoiceServerEvent = {
  type: string;
  sessionId: string;
  [key: string]: unknown;
};

class RealtimeVoiceOrchestrator {
  private readonly sessions = new Map<string, VoiceSession>();
  private readonly sessionClients = new Map<string, Set<WebSocket>>();
  private readonly turnManager = new TurnManager();
  private readonly speechQueue = new SpeechQueue();

  createSession(participantIds: string[]): VoiceSession {
    const participants = AgentRegistry.list()
      .filter((agent) => participantIds.includes(agent.name.toLowerCase()))
      .map((agent) => ({
        id: agent.name.toLowerCase(),
        name: agent.name,
        role: agent.role,
      }));

    const session: VoiceSession = {
      id: randomUUID(),
      participants: participants.length
        ? participants
        : AgentRegistry.list().slice(0, 3).map((agent) => ({
            id: agent.name.toLowerCase(),
            name: agent.name,
            role: agent.role,
          })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeSpeakerId: null,
      queue: [],
      transcript: [],
      metrics: {
        timeToFirstSpeechMs: null,
        lastTurnLatencyMs: null,
        tokensPerSecond: 0,
        lastPlaybackState: "idle",
      },
    };

    this.sessions.set(session.id, session);
    this.emitMissionControlVoiceState(session);
    return this.snapshot(session.id);
  }

  snapshot(sessionId: string): VoiceSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown realtime voice session ${sessionId}.`);
    }

    return JSON.parse(JSON.stringify(session)) as VoiceSession;
  }

  currentControlSnapshot() {
    const session = Array.from(this.sessions.values()).at(-1);
    return session ? this.snapshot(session.id) : null;
  }

  attachClient(ws: WebSocket, sessionId: string) {
    const bucket = this.sessionClients.get(sessionId) || new Set<WebSocket>();
    bucket.add(ws);
    this.sessionClients.set(sessionId, bucket);
    ws.send(JSON.stringify({ type: "session.snapshot", sessionId, session: this.snapshot(sessionId) }));
  }

  detachClient(ws: WebSocket) {
    for (const bucket of this.sessionClients.values()) {
      bucket.delete(ws);
    }
  }

  async handleMessage(ws: WebSocket, message: SessionClientMessage) {
    switch (message.type) {
      case "join_session":
        this.attachClient(ws, message.sessionId);
        return;
      case "operator_utterance":
        await this.handleOperatorUtterance(message.sessionId, message.text);
        return;
      case "playback_state": {
        const session = this.sessions.get(message.sessionId);
        if (!session) {
          return;
        }
        session.metrics.lastPlaybackState = message.state;
        session.updatedAt = new Date().toISOString();
        this.broadcast(message.sessionId, {
          type: "playback.state",
          sessionId: message.sessionId,
          state: message.state,
        });
        this.emitMissionControlVoiceState(session);
        return;
      }
    }
  }

  async handleOperatorUtterance(sessionId: string, text: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !text.trim()) {
      return;
    }

    const entry: SessionTranscriptEntry = {
      id: randomUUID(),
      speaker: "TASK",
      text: text.trim(),
      timestamp: new Date().toISOString(),
      final: true,
    };
    session.transcript.push(entry);
    session.updatedAt = entry.timestamp;
    this.broadcast(sessionId, { type: "transcript.append", sessionId, entry });

    for (const participant of session.participants) {
      this.turnManager.enqueue({
        id: randomUUID(),
        sessionId,
        agentId: participant.id,
        agentName: participant.name,
        kind: "agent",
        attempts: 0,
        createdAt: new Date().toISOString(),
      });
    }

    session.queue = this.turnManager.snapshot().queued
      .filter((turn) => turn.sessionId === sessionId)
      .map((turn) => ({ id: turn.agentId, name: turn.agentName }));
    this.emitMissionControlVoiceState(session);
    this.drainQueue();
  }

  private drainQueue() {
    this.turnManager.beginNext((turn) => {
      void this.executeTurn(turn).finally(() => {
        this.turnManager.release(turn.id);
        const session = this.sessions.get(turn.sessionId);
        if (session) {
          session.queue = this.turnManager.snapshot().queued
            .filter((queuedTurn) => queuedTurn.sessionId === turn.sessionId)
            .map((queuedTurn) => ({ id: queuedTurn.agentId, name: queuedTurn.agentName }));
          this.emitMissionControlVoiceState(session);
        }
        this.drainQueue();
      });
    });
  }

  private async executeTurn(turn: TurnRequest) {
    const session = this.sessions.get(turn.sessionId);
    if (!session) {
      return;
    }

    session.activeSpeakerId = turn.agentId;
    session.updatedAt = new Date().toISOString();
    this.broadcast(turn.sessionId, {
      type: "turn.started",
      sessionId: turn.sessionId,
      turn,
      queue: session.queue,
    });
    this.emitMissionControlVoiceState(session);

    if (turn.kind === "filler") {
      const fillerText = "One second, checking that now.";
      this.emitSpeechSegment(turn, fillerText, "Natural fallback");
      this.appendTranscript(turn.sessionId, turn.agentName, fillerText, true);
      return;
    }

    const abortController = new AbortController();
    const startedAt = Date.now();
    let tokenCount = 0;
    let firstTokenSeen = false;
    let fullText = "";
    let firstTokenTimer: NodeJS.Timeout | null = null;

    const buffer = new TokenBuffer({
      minTokens: 3,
      maxLatencyMs: 180,
      onFlush: (segment) => {
        this.emitSpeechSegment(turn, segment, `${turn.agentName} preferred voice`);
      },
    });

    const prompt = buildRealtimeConversationPrompt({
      agentName: turn.agentName,
      role: session.participants.find((entry) => entry.id === turn.agentId)?.role || "Agent",
      transcript: session.transcript.map((entry) => ({ speaker: entry.speaker, text: entry.text })),
      turnIndex: session.transcript.length,
    });

    firstTokenTimer = setTimeout(() => {
      abortController.abort();
      const fallback = this.resolveFallbackAgent(session, turn.agentId);
      if (fallback) {
        this.turnManager.enqueueFront({
          id: randomUUID(),
          sessionId: turn.sessionId,
          agentId: turn.agentId,
          agentName: turn.agentName,
          kind: "agent",
          attempts: turn.attempts + 1,
          createdAt: new Date().toISOString(),
        });
        this.turnManager.enqueueFront({
          id: randomUUID(),
          sessionId: turn.sessionId,
          agentId: fallback.id,
          agentName: fallback.name,
          kind: "filler",
          attempts: 0,
          createdAt: new Date().toISOString(),
        });
      }
    }, 300);

    try {
      const result = await streamAgentTurn({
        agentName: turn.agentName,
        prompt,
        signal: abortController.signal,
        onToken: (token) => {
          tokenCount += 1;
          fullText += token;
          if (!firstTokenSeen) {
            firstTokenSeen = true;
            if (firstTokenTimer) {
              clearTimeout(firstTokenTimer);
              firstTokenTimer = null;
            }
            session.metrics.timeToFirstSpeechMs = Date.now() - startedAt;
          }
          buffer.add(token);
          session.metrics.tokensPerSecond = Number(
            (tokenCount / Math.max(0.25, (Date.now() - startedAt) / 1000)).toFixed(2)
          );
          this.broadcast(turn.sessionId, {
            type: "metrics.update",
            sessionId: turn.sessionId,
            metrics: session.metrics,
          });
        },
      });

      if (firstTokenTimer) {
        clearTimeout(firstTokenTimer);
      }

      buffer.close();
      session.metrics.lastTurnLatencyMs = result.firstTokenLatencyMs;
      this.appendTranscript(turn.sessionId, turn.agentName, fullText || result.fullText, true);
    } catch (error) {
      if (firstTokenTimer) {
        clearTimeout(firstTokenTimer);
      }

      if ((error as Error).name !== "AbortError") {
        this.broadcast(turn.sessionId, {
          type: "turn.error",
          sessionId: turn.sessionId,
          turnId: turn.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      session.activeSpeakerId = null;
      session.updatedAt = new Date().toISOString();
      this.broadcast(turn.sessionId, {
        type: "turn.finished",
        sessionId: turn.sessionId,
        turnId: turn.id,
      });
      this.emitMissionControlVoiceState(session);
    }
  }

  private appendTranscript(sessionId: string, speaker: string, text: string, final: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session || !text.trim()) {
      return;
    }

    const entry: SessionTranscriptEntry = {
      id: randomUUID(),
      speaker,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      final,
    };
    session.transcript.push(entry);
    session.transcript = session.transcript.slice(-80);
    session.updatedAt = entry.timestamp;
    this.broadcast(sessionId, { type: "transcript.append", sessionId, entry });
    this.emitMissionControlVoiceState(session);
  }

  private emitSpeechSegment(turn: TurnRequest, text: string, voiceHint: string) {
    const segment = {
      id: randomUUID(),
      turnId: turn.id,
      agentId: turn.agentId,
      agentName: turn.agentName,
      text,
      emittedAt: new Date().toISOString(),
      tts: createTtsStreamChunk(turn.agentId, text, voiceHint),
    };

    this.speechQueue.enqueue(segment);
    this.broadcast(turn.sessionId, {
      type: "speech.segment",
      sessionId: turn.sessionId,
      segment,
    });
  }

  private resolveFallbackAgent(session: VoiceSession, excludedAgentId: string) {
    return session.participants.find((participant) => participant.id === "abdi")
      || session.participants.find((participant) => participant.id === "dame")
      || session.participants.find((participant) => participant.id !== excludedAgentId)
      || null;
  }

  private broadcast(sessionId: string, event: VoiceServerEvent) {
    const bucket = this.sessionClients.get(sessionId);
    if (!bucket?.size) {
      return;
    }

    const payload = JSON.stringify(event);
    for (const client of bucket) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private emitMissionControlVoiceState(session: VoiceSession) {
    void MissionControlStateService.recordRealtimeVoiceState({
      sessionId: session.id,
      activeSpeakerId: session.activeSpeakerId,
      queue: session.queue,
      transcript: session.transcript.slice(-12),
      metrics: session.metrics,
      participants: session.participants,
    });
  }
}

export const realtimeVoiceOrchestrator = new RealtimeVoiceOrchestrator();
