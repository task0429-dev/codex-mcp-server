import type { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import { realtimeVoiceOrchestrator } from "./voice-orchestrator";

export function attachRealtimeVoiceServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws/realtime-voice" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/ws/realtime-voice", "http://localhost");
    const sessionId = url.searchParams.get("sessionId");

    if (sessionId) {
      try {
        realtimeVoiceOrchestrator.attachClient(ws, sessionId);
      } catch {
        ws.close(1008, "Unknown session");
        return;
      }
    }

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw));
        void realtimeVoiceOrchestrator.handleMessage(ws, message);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid realtime voice payload." }));
      }
    });

    ws.on("close", () => {
      realtimeVoiceOrchestrator.detachClient(ws);
    });
  });
}
