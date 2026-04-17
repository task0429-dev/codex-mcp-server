type Scope = string;

interface SeenEntry {
  expiresAt: number;
}

const seen = new Map<string, SeenEntry>();

function makeKey(scope: Scope, agentName: string, prompt: string): string {
  return `${scope}::${agentName.toLowerCase()}::${prompt.trim().toLowerCase()}`;
}

function prune(now: number): void {
  for (const [key, entry] of seen.entries()) {
    if (entry.expiresAt <= now) {
      seen.delete(key);
    }
  }
}

export function isDuplicatePrompt(scope: Scope, agentName: string, prompt: string, windowMs: number): boolean {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt || windowMs <= 0) return false;

  const now = Date.now();
  prune(now);

  const key = makeKey(scope, agentName, cleanPrompt);
  const existing = seen.get(key);
  if (existing && existing.expiresAt > now) {
    return true;
  }

  seen.set(key, { expiresAt: now + windowMs });
  return false;
}
