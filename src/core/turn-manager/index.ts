export interface TurnRequest {
  id: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  kind: "agent" | "filler";
  attempts: number;
  createdAt: string;
}

export class TurnManager {
  private readonly queue: TurnRequest[] = [];
  private activeTurn: TurnRequest | null = null;
  private lockTimer: NodeJS.Timeout | null = null;

  constructor(private readonly lockTimeoutMs = 15_000) {}

  enqueue(turn: TurnRequest) {
    this.queue.push(turn);
  }

  enqueueFront(turn: TurnRequest) {
    this.queue.unshift(turn);
  }

  beginNext(onStart: (turn: TurnRequest) => void): TurnRequest | null {
    if (this.activeTurn || !this.queue.length) {
      return null;
    }

    const next = this.queue.shift() || null;
    if (!next) {
      return null;
    }

    this.activeTurn = next;
    this.lockTimer = setTimeout(() => {
      this.release(next.id);
      onStart({
        ...next,
        id: `${next.id}-timeout`,
        kind: "filler",
        attempts: next.attempts + 1,
      });
    }, this.lockTimeoutMs);
    onStart(next);
    return next;
  }

  release(turnId: string) {
    if (this.activeTurn?.id !== turnId) {
      return;
    }

    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }

    this.activeTurn = null;
  }

  snapshot() {
    return {
      active: this.activeTurn,
      queued: this.queue.slice(),
    };
  }
}
