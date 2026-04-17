export interface StreamingTranscriptChunk {
  text: string;
  final: boolean;
  source: "browser" | "provider";
}

export function normalizeStreamingTranscriptChunk(text: string, final = false): StreamingTranscriptChunk {
  return {
    text: text.trim(),
    final,
    source: "browser",
  };
}
