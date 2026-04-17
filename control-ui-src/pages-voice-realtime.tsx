import { useEffect, useMemo, useRef, useState } from "react";
import { Btn } from "./shell";
import { cn, formatRelative, type PageProps } from "./types";

type TranscriptEntry = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  final: boolean;
};

type VoiceSessionSnapshot = {
  id: string;
  participants: Array<{ id: string; name: string; role: string }>;
  activeSpeakerId: string | null;
  queue: Array<{ id: string; name: string }>;
  transcript: TranscriptEntry[];
  metrics: {
    timeToFirstSpeechMs: number | null;
    lastTurnLatencyMs: number | null;
    tokensPerSecond: number;
    lastPlaybackState: string;
  };
};

type VoiceRealtimeEvent =
  | { type: "session.snapshot"; session: VoiceSessionSnapshot }
  | { type: "transcript.append"; entry: TranscriptEntry }
  | { type: "speech.segment"; segment: { id: string; agentId: string; agentName: string; text: string } }
  | { type: "turn.started"; turn: { agentId: string } }
  | { type: "turn.finished"; turnId: string }
  | { type: "metrics.update"; metrics: VoiceSessionSnapshot["metrics"] }
  | { type: "playback.state"; state: string }
  | { type: "turn.error"; message: string };

type PendingSpeech = {
  id: string;
  agentId: string;
  text: string;
};

function pickColor(agentId: string) {
  const palette: Record<string, string> = {
    abdi: "#7ef0b8",
    ahmed: "#65d2ff",
    dame: "#ff9e57",
    rex: "#ff6b6b",
    prime: "#8e86ff",
    atlas: "#3be1c7",
    ayub: "#f8d66d",
    sygma: "#ff8fcf",
  };

  return palette[agentId] || "var(--accent)";
}

function buildWsUrl(sessionId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/realtime-voice?sessionId=${sessionId}`;
}

function speakChunk(
  queue: PendingSpeech[],
  playingRef: React.MutableRefObject<boolean>,
  sessionId: string | undefined,
  ws: WebSocket | null,
  onDone: () => void
) {
  if (playingRef.current || !queue.length) {
    return;
  }

  const next = queue[0];
  if (!("speechSynthesis" in window)) {
    onDone();
    return;
  }

  playingRef.current = true;
  if (sessionId) {
    ws?.send(JSON.stringify({ type: "playback_state", sessionId, state: "speaking" }));
  }
  const utterance = new SpeechSynthesisUtterance(next.text);
  utterance.rate = 1.15;
  utterance.pitch = 1;
  utterance.onend = () => {
    playingRef.current = false;
    onDone();
  };
  utterance.onerror = () => {
    playingRef.current = false;
    onDone();
  };
  window.speechSynthesis.speak(utterance);
}

export function VoicePage({ data, focus }: PageProps) {
  const availableAgents: any[] = data.voice?.agents?.length ? data.voice.agents : data.agents;
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(["abdi", "dame", "ayub"]);
  const [session, setSession] = useState<VoiceSessionSnapshot | null>(null);
  const [statusText, setStatusText] = useState("Select agents, start a call, then press S to talk.");
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [socketReady, setSocketReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const finalTextRef = useRef("");
  const interimTextRef = useRef("");
  const speechQueueRef = useRef<PendingSpeech[]>([]);
  const speechPlayingRef = useRef(false);

  const activeSpeakerId = session?.activeSpeakerId || null;
  const activeSpeaker = useMemo(
    () => availableAgents.find((agent: any) => agent.id === activeSpeakerId) || null,
    [activeSpeakerId, availableAgents]
  );

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.transcript, interimText]);

  useEffect(() => () => {
    wsRef.current?.close();
    recognitionRef.current?.abort?.();
    window.speechSynthesis.cancel();
  }, []);

  const flushSpeechQueue = () => {
    if (!speechQueueRef.current.length) {
      wsRef.current?.send(JSON.stringify({
        type: "playback_state",
        sessionId: session?.id,
        state: "idle",
      }));
      return;
    }

    speakChunk(speechQueueRef.current, speechPlayingRef, session?.id, wsRef.current, () => {
      speechQueueRef.current = speechQueueRef.current.slice(1);
      flushSpeechQueue();
    });
  };

  const handleRealtimeEvent = (event: VoiceRealtimeEvent) => {
    if (event.type === "session.snapshot") {
      setSession(event.session);
      setStatusText("Realtime call live. Press S to start or stop speaking.");
      return;
    }

    if (event.type === "transcript.append") {
      setSession((current) => current ? { ...current, transcript: [...current.transcript, event.entry].slice(-80) } : current);
      return;
    }

    if (event.type === "speech.segment") {
      speechQueueRef.current = [...speechQueueRef.current, {
        id: event.segment.id,
        agentId: event.segment.agentId,
        text: event.segment.text,
      }];
      flushSpeechQueue();
      return;
    }

    if (event.type === "turn.started") {
      setSession((current) => current ? { ...current, activeSpeakerId: event.turn.agentId } : current);
      setStatusText("Agent turn started.");
      return;
    }

    if (event.type === "turn.finished") {
      setSession((current) => current ? { ...current, activeSpeakerId: null } : current);
      setStatusText("Turn finished. Queue advancing.");
      return;
    }

    if (event.type === "metrics.update") {
      setSession((current) => current ? { ...current, metrics: event.metrics } : current);
      return;
    }

    if (event.type === "playback.state") {
      setSession((current) => current ? { ...current, metrics: { ...current.metrics, lastPlaybackState: event.state } } : current);
      return;
    }

    if (event.type === "turn.error") {
      setStatusText(event.message);
    }
  };

  const connectSocket = (sessionId: string) => {
    wsRef.current?.close();
    const ws = new WebSocket(buildWsUrl(sessionId));
    wsRef.current = ws;
    ws.onopen = () => setSocketReady(true);
    ws.onclose = () => setSocketReady(false);
    ws.onmessage = (raw) => {
      try {
        handleRealtimeEvent(JSON.parse(raw.data));
      } catch {
        // Ignore malformed realtime packets.
      }
    };
  };

  const startSession = async () => {
    const response = await fetch("/api/realtime/voice/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantIds: selectedAgentIds }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      setStatusText(payload?.error || `Unable to start session (${response.status}).`);
      return;
    }

    setSession(payload.session);
    setStatusText("Realtime voice call created. Connecting live transport.");
    connectSocket(payload.session.id);
  };

  const sendOperatorUtterance = (text: string) => {
    if (!session || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: "operator_utterance",
      sessionId: session.id,
      text,
    }));
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusText("Streaming STT requires Chrome SpeechRecognition in this browser.");
      return;
    }

    finalTextRef.current = "";
    interimTextRef.current = "";
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setListening(true);
      setStatusText("Listening live. Press S again to hand the floor to the agents.");
    };

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const chunk = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          finalText += chunk;
        } else {
          interim += chunk;
        }
      }
      if (finalText) {
        finalTextRef.current += finalText;
      }
      interimTextRef.current = interim;
      setInterimText(`${finalTextRef.current} ${interim}`.trim());
    };

    recognition.onend = () => {
      setListening(false);
      const text = `${finalTextRef.current} ${interimTextRef.current}`.trim();
      finalTextRef.current = "";
      interimTextRef.current = "";
      setInterimText("");
      if (text) {
        sendOperatorUtterance(text);
      } else {
        setStatusText("No operator speech detected. Press S to try again.");
      }
    };

    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop?.();
    setListening(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if ((event.target as HTMLElement)?.tagName === "INPUT" || (event.target as HTMLElement)?.tagName === "TEXTAREA") {
        return;
      }
      if (event.key.toLowerCase() !== "s" || !session) {
        return;
      }
      if (listeningRef.current) {
        stopListening();
      } else {
        startListening();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((current) => current.includes(agentId)
      ? current.filter((entry) => entry !== agentId)
      : [...current, agentId]
    );
  };

  return (
    <div style={{ display: "grid", gap: 16, minHeight: "calc(100vh - 180px)" }}>
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="section-kicker">Realtime Voice Engine</div>
            <h2 className="section-title">Live multi-agent call orchestration</h2>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="text-xs text-3">{socketReady ? "WebSocket live" : "WebSocket offline"}</span>
            <Btn variant="primary" size="sm" onClick={startSession}>Start Live Call</Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <div className="voice-agents-grid">
            {availableAgents.map((agent: any) => {
              const selected = selectedAgentIds.includes(agent.id);
              const speaking = activeSpeakerId === agent.id;
              const color = pickColor(agent.id);
              return (
                <button
                  key={agent.id}
                  className={cn("voice-agent-card", selected && "voice-agent-card-active")}
                  style={selected ? { borderColor: color, boxShadow: `0 0 0 1px ${color}55 inset` } : {}}
                  onClick={() => {
                    toggleAgent(agent.id);
                    focus("voice", agent);
                  }}
                >
                  <div className="voice-agent-avatar" style={{ color, background: `${color}18` }}>
                    {agent.name.charAt(0)}
                  </div>
                  <div className="voice-agent-name">{agent.name}</div>
                  <div className="voice-agent-role">{agent.role}</div>
                  <div className="voice-agent-status" style={{ color }}>
                    {speaking ? "Active speaker" : selected ? "Queued for call" : "Idle"}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="panel" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="section-kicker">Live Metrics</div>
            <div className="metric-grid">
              <div className="stat-card">
                <span className="label">TTFS</span>
                <strong>{session?.metrics.timeToFirstSpeechMs ?? data.voice.metrics?.timeToFirstSpeechMs ?? "—"} ms</strong>
              </div>
              <div className="stat-card">
                <span className="label">Turn Latency</span>
                <strong>{session?.metrics.lastTurnLatencyMs ?? data.voice.metrics?.lastTurnLatencyMs ?? "—"} ms</strong>
              </div>
              <div className="stat-card">
                <span className="label">Token Rate</span>
                <strong>{session?.metrics.tokensPerSecond?.toFixed?.(1) ?? data.voice.metrics?.tokensPerSecond ?? 0}/s</strong>
              </div>
              <div className="stat-card">
                <span className="label">Playback</span>
                <strong>{session?.metrics.lastPlaybackState || data.voice.metrics?.lastPlaybackState || "idle"}</strong>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="section-kicker">Turn Queue</div>
              {(session?.queue || data.voice.queue || []).length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {(session?.queue || data.voice.queue || []).map((entry: any) => (
                    <div key={entry.id} className="surface-row">
                      <span>{entry.name}</span>
                      <span className="text-xs text-3">{entry.id}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-3">Queue empty. The next speaker will be scheduled immediately after TASK speaks.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="voice-status-bar">
        <span className={cn("voice-status-dot", listening ? "voice-status-dot-listen" : activeSpeaker ? "voice-status-dot-speak" : "voice-status-dot-idle")} />
        <span className="text-sm text-2">{statusText}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={() => listening ? stopListening() : startListening()}>{listening ? "Stop Mic (S)" : "Start Mic (S)"}</Btn>
          <Btn variant="ghost" size="sm" onClick={() => {
            wsRef.current?.close();
            setSession(null);
            setSocketReady(false);
            setStatusText("Live call ended.");
            speechQueueRef.current = [];
            speechPlayingRef.current = false;
            window.speechSynthesis.cancel();
          }}>End Call</Btn>
        </div>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12, overflow: "auto" }}>
        {(session?.transcript || data.voice.currentSession.transcript || []).map((entry: any) => {
          const agent = availableAgents.find((candidate: any) => candidate.name === entry.speaker || candidate.id === entry.speaker?.toLowerCase());
          const color = pickColor(agent?.id || entry.speaker?.toLowerCase() || "");
          const isTask = entry.speaker === "TASK";
          return (
            <div key={entry.id} className={cn("voice-msg", isTask ? "voice-msg-user" : "voice-msg-agent")}>
              <div className="voice-msg-name" style={!isTask ? { color } : undefined}>{entry.speaker}</div>
              <div className="voice-msg-bubble" style={!isTask ? { borderColor: `${color}55` } : undefined}>{entry.text}</div>
              <div className="voice-msg-time">{formatRelative(entry.timestamp)}</div>
            </div>
          );
        })}
        {interimText ? (
          <div className="voice-msg voice-msg-user">
            <div className="voice-msg-name">TASK</div>
            <div className="voice-msg-bubble voice-msg-interim">{interimText}</div>
          </div>
        ) : null}
        <div ref={transcriptEndRef} />
      </div>
    </div>
  );
}
