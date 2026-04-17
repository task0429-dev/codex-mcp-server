export interface TokenBufferOptions {
  minTokens?: number;
  maxLatencyMs?: number;
  onFlush: (segment: string, meta: { reason: "punctuation" | "latency" | "close"; tokenCount: number }) => void;
}

const DEFAULT_MIN_TOKENS = 4;
const DEFAULT_MAX_LATENCY_MS = 180;
const PUNCTUATION_RE = /[.!?,;:]\s*$/;

export class TokenBuffer {
  private readonly minTokens: number;
  private readonly maxLatencyMs: number;
  private readonly onFlush: TokenBufferOptions["onFlush"];
  private readonly parts: string[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(options: TokenBufferOptions) {
    this.minTokens = options.minTokens ?? DEFAULT_MIN_TOKENS;
    this.maxLatencyMs = options.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS;
    this.onFlush = options.onFlush;
  }

  add(token: string) {
    if (!token) {
      return;
    }

    this.parts.push(token);
    this.ensureTimer();

    const candidate = this.parts.join("");
    if (this.parts.length >= this.minTokens && PUNCTUATION_RE.test(candidate)) {
      this.flush("punctuation");
    }
  }

  close() {
    this.flush("close");
  }

  private ensureTimer() {
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush("latency");
    }, this.maxLatencyMs);
  }

  private flush(reason: "punctuation" | "latency" | "close") {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.parts.length) {
      return;
    }

    const segment = this.parts.join("").trim();
    const tokenCount = this.parts.length;
    this.parts.length = 0;

    if (!segment) {
      return;
    }

    this.onFlush(segment, { reason, tokenCount });
  }
}
