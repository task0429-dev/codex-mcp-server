const REDACTED_VALUE = "[REDACTED]";

function shouldRedact(key: string, redactKeys: string[]): boolean {
  const normalizedKey = key.toLowerCase();
  return redactKeys.some((entry) => normalizedKey.includes(entry.toLowerCase()));
}

export function redactSecrets<T>(value: T, redactKeys: string[]): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry, redactKeys)) as T;
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = shouldRedact(key, redactKeys) ? REDACTED_VALUE : redactSecrets(nested, redactKeys);
    }
    return output as T;
  }

  return value;
}
