export interface SpeechSegment {
  id: string;
  turnId: string;
  agentId: string;
  text: string;
  emittedAt: string;
}

export class SpeechQueue {
  private readonly items: SpeechSegment[] = [];

  enqueue(segment: SpeechSegment) {
    this.items.push(segment);
  }

  list(): SpeechSegment[] {
    return this.items.slice(-40);
  }

  clearTurn(turnId: string) {
    const remaining = this.items.filter((item) => item.turnId !== turnId);
    this.items.length = 0;
    this.items.push(...remaining);
  }
}
