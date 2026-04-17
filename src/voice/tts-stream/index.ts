export interface TtsStreamChunk {
  agentId: string;
  text: string;
  voiceHint: string;
}

export function createTtsStreamChunk(agentId: string, text: string, voiceHint: string): TtsStreamChunk {
  return {
    agentId,
    text,
    voiceHint,
  };
}
