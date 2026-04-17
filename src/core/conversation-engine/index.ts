const CONVERSATIONAL_STARTERS = [
  "Alright,",
  "Yeah, so",
  "Let me check that,",
  "Okay,",
  "Right,",
];

function pickStarter(agentId: string, turnIndex: number): string {
  const seed = `${agentId}-${turnIndex}`.split("").reduce((sum, entry) => sum + entry.charCodeAt(0), 0);
  return CONVERSATIONAL_STARTERS[seed % CONVERSATIONAL_STARTERS.length];
}

export interface ConversationPromptInput {
  agentName: string;
  role: string;
  transcript: Array<{ speaker: string; text: string }>;
  turnIndex: number;
}

export function buildRealtimeConversationPrompt(input: ConversationPromptInput): string {
  const transcriptTail = input.transcript
    .slice(-8)
    .map((entry) => `${entry.speaker}: ${entry.text}`)
    .join("\n");

  const starter = pickStarter(input.agentName.toLowerCase(), input.turnIndex);

  return [
    `You are ${input.agentName}. Role: ${input.role}.`,
    "You are inside a live multi-agent phone call with TASK.",
    "Respond like spoken conversation, not like an essay.",
    `Start naturally with a phrase like "${starter}" and speak in 1-2 short sentences only.`,
    "Keep your turn under 35 words unless a number, warning, or instruction requires slightly more.",
    "Do not preamble, do not list bullets, do not repeat the prompt.",
    transcriptTail ? `Recent live transcript:\n${transcriptTail}` : "No prior transcript yet.",
    "Reply now.",
  ].join("\n\n");
}
