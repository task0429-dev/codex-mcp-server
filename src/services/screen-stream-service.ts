import { spawn, ChildProcess } from "child_process";
import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { logger } from "../core/logger";
import { HTTP_PORT } from "../config";

export interface StreamConfig {
  fps: number;
  scale: number;
  quality: number; // ffmpeg jpeg quality 1-31 (lower = better)
}

const DEFAULT_CONFIG: StreamConfig = { fps: 5, scale: 1280, quality: 5 };

// JPEG boundary markers
const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

class ScreenStreamService {
  private wss: WebSocketServer | null = null;
  private ffmpegProcess: ChildProcess | null = null;
  private config: StreamConfig = { ...DEFAULT_CONFIG };
  private running = false;
  private frameCount = 0;
  private lastFrameTime = 0;

  attachToServer(server: Server): void {
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req: IncomingMessage, socket, head) => {
      const url = req.url || "";
      if (url === "/stream/screen" || url.startsWith("/stream/screen?")) {
        this.wss!.handleUpgrade(req, socket as any, head, (ws) => {
          this.wss!.emit("connection", ws, req);
        });
      }
    });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      logger.info("screen_stream_client_connected", { ip: req.socket.remoteAddress });
      ws.send(JSON.stringify({ type: "status", running: this.running, config: this.config }));

      ws.on("message", (msg) => {
        try {
          const data = JSON.parse(msg.toString());
          if (data.action === "start") this.start(data.config);
          else if (data.action === "stop") this.stop();
        } catch {}
      });

      ws.on("close", () => logger.info("screen_stream_client_disconnected"));
    });
  }

  start(config?: Partial<StreamConfig>): void {
    if (this.running) this.stop();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.running = true;
    this.startFfmpeg();
    logger.info("screen_stream_started", this.config);
    this.broadcast({ type: "status", running: true, config: this.config });
  }

  stop(): void {
    this.running = false;
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill("SIGTERM");
      this.ffmpegProcess = null;
    }
    this.broadcast({ type: "status", running: false });
    logger.info("screen_stream_stopped");
  }

  getStatus() {
    return {
      running: this.running,
      config: this.config,
      frame_count: this.frameCount,
      clients: this.wss?.clients.size ?? 0,
      ws_url: `ws://localhost:${HTTP_PORT}/stream/screen`,
    };
  }

  private startFfmpeg(): void {
    const args = [
      "-f", "gdigrab",
      "-framerate", String(this.config.fps),
      "-i", "desktop",
      "-vf", `scale=${this.config.scale}:-1`,
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-q:v", String(this.config.quality),
      "pipe:1",
    ];

    this.ffmpegProcess = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "ignore"] });

    let buffer = Buffer.alloc(0);

    this.ffmpegProcess.stdout!.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      let start = 0;
      while (true) {
        const soiIdx = buffer.indexOf(JPEG_SOI, start);
        if (soiIdx === -1) break;
        const eoiIdx = buffer.indexOf(JPEG_EOI, soiIdx + 2);
        if (eoiIdx === -1) break;

        const frame = buffer.slice(soiIdx, eoiIdx + 2);
        this.onFrame(frame);
        start = eoiIdx + 2;
      }

      buffer = start > 0 ? buffer.slice(start) : buffer;

      // Prevent unbounded growth
      if (buffer.length > 8 * 1024 * 1024) buffer = Buffer.alloc(0);
    });

    this.ffmpegProcess.on("error", (err) => {
      logger.error("screen_stream_ffmpeg_error", { error: err.message });
      this.running = false;
      this.broadcast({
        type: "error",
        message: "ffmpeg not found. Install ffmpeg and add it to PATH, then restart.",
      });
    });

    this.ffmpegProcess.on("exit", (code) => {
      if (this.running) {
        logger.warn("screen_stream_ffmpeg_exited", { code });
        this.running = false;
        this.broadcast({ type: "error", message: `ffmpeg exited with code ${code}` });
      }
    });
  }

  private onFrame(frame: Buffer): void {
    this.frameCount++;
    this.lastFrameTime = Date.now();
    this.broadcast({
      type: "frame",
      base64: frame.toString("base64"),
      timestamp: this.lastFrameTime,
      frame_number: this.frameCount,
    });
  }

  private broadcast(data: object): void {
    if (!this.wss) return;
    const msg = JSON.stringify(data);
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }
}

export const screenStreamService = new ScreenStreamService();
