interface StreamChunk {
  text: string;
  raw: unknown;
}

export interface LlmStreamCallbacks {
  onText: (chunk: StreamChunk) => void;
  onDone: () => void;
}

function parseChunkText(payload: any): string {
  const delta = payload?.choices?.[0]?.delta;
  if (typeof delta?.content === "string") {
    return delta.content;
  }

  if (Array.isArray(delta?.content)) {
    return delta.content.map((entry: any) => String(entry?.text || "")).join("");
  }

  if (typeof payload?.choices?.[0]?.message?.content === "string") {
    return payload.choices[0].message.content;
  }

  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  return "";
}

export async function consumeOpenAiCompatibleStream(
  response: Response,
  callbacks: LlmStreamCallbacks
): Promise<void> {
  if (!response.body) {
    const payload = await response.json().catch(() => null);
    const text = parseChunkText(payload);
    if (text) {
      callbacks.onText({ text, raw: payload });
    }
    callbacks.onDone();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const line of frame.split(/\r?\n/)) {
        if (!line.startsWith("data:")) {
          continue;
        }

        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") {
          continue;
        }

        const payload = JSON.parse(raw);
        const text = parseChunkText(payload);
        if (text) {
          callbacks.onText({ text, raw: payload });
        }
      }

      boundary = buffer.indexOf("\n\n");
    }
  }

  callbacks.onDone();
}
