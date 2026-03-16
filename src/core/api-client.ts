import { config } from "../config/config";

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? config.DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${payload?.error?.message || payload?.message || text || response.statusText}`);
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestText(url: string, options: RequestOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? config.DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}
