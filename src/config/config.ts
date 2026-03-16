import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
dotenv.config({ path: path.resolve(PROJECT_ROOT, ".env") });

const EnvSchema = z.object({
  SESSION_DIR: z.string().optional(),
  MEMORY_DIR: z.string().optional(),
  LOG_DIR: z.string().optional(),
  RESTART_ALLOWLIST: z.string().optional(),
  UNLOCK_ALLOWLIST: z.string().optional(),
  POWERSHELL_PATH: z.string().optional(),
  DEFAULT_TIMEOUT_MS: z.string().optional(),
  HTTP_PORT: z.string().optional(),
  HTTP_HOST: z.string().optional(),
  HTTP_CORS_ORIGIN: z.string().optional(),
  MCP_HTTP_BACKEND_URL: z.string().optional(),
  MCP_HTTP_BACKEND_TIMEOUT_MS: z.string().optional(),
  GATEWAY_URL: z.string().optional(),
  GATEWAY_WS_URL: z.string().optional(),
  GATEWAY_WS_ORIGIN: z.string().optional(),
  GATEWAY_ENABLED: z.string().optional(),
  GATEWAY_CHAT_PATH: z.string().optional(),
  GATEWAY_LOGIN_PATH: z.string().optional(),
  GATEWAY_API_KEY: z.string().optional(),
  GATEWAY_AUTH_HEADER: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  NODE_ENV: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  NOTION_TOKEN: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_API_BASE: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  ABDI_TELEGRAM_BOT_TOKEN: z.string().optional(),
  AHMED_TELEGRAM_BOT_TOKEN: z.string().optional(),
  DAME_TELEGRAM_BOT_TOKEN: z.string().optional(),
  REX_TELEGRAM_BOT_TOKEN: z.string().optional(),
  PRIME_TELEGRAM_BOT_TOKEN: z.string().optional(),
  ATLAS_TELEGRAM_BOT_TOKEN: z.string().optional(),
  AYUB_TELEGRAM_BOT_TOKEN: z.string().optional(),
  SYGMA_TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_API_BASE: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  DAME_OPENAI_API_KEY: z.string().optional(),
  DAME_OPENAI_MODEL_ID: z.string().optional(),
  ABDI_OPENROUTER_API_KEY: z.string().optional(),
  AHMED_OPENROUTER_API_KEY: z.string().optional(),
  DAME_OPENROUTER_API_KEY: z.string().optional(),
  REX_OPENROUTER_API_KEY: z.string().optional(),
  PRIME_OPENROUTER_API_KEY: z.string().optional(),
  ATLAS_OPENROUTER_API_KEY: z.string().optional(),
  AYUB_OPENROUTER_API_KEY: z.string().optional(),
  SYGMA_OPENROUTER_API_KEY: z.string().optional(),
  ABDI_OPENROUTER_MODEL_ID: z.string().optional(),
  AHMED_OPENROUTER_MODEL_ID: z.string().optional(),
  DAME_OPENROUTER_MODEL_ID: z.string().optional(),
  REX_OPENROUTER_MODEL_ID: z.string().optional(),
  PRIME_OPENROUTER_MODEL_ID: z.string().optional(),
  ATLAS_OPENROUTER_MODEL_ID: z.string().optional(),
  AYUB_OPENROUTER_MODEL_ID: z.string().optional(),
  SYGMA_OPENROUTER_MODEL_ID: z.string().optional(),
  GOOGLE_DRIVE_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  GOOGLE_DRIVE_DEFAULT_FOLDER_ID: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SCHEMA: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  AIRTABLE_TOKEN: z.string().optional(),
  AIRTABLE_BASE_ID: z.string().optional(),
  N8N_BASE_URL: z.string().optional(),
  N8N_API_KEY: z.string().optional(),
  HUBSPOT_ACCESS_TOKEN: z.string().optional(),
});

const env = EnvSchema.parse(process.env);
const parseList = (value?: string): string[] => (value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizePrivateKey = (value?: string): string | undefined => value ? value.replace(/\\n/g, "\n") : undefined;

export const config = {
  PROJECT_ROOT,
  SESSION_DIR: path.resolve(env.SESSION_DIR || "./data/sessions"),
  MEMORY_DIR: path.resolve(env.MEMORY_DIR || "./data/memory"),
  LOG_DIR: path.resolve(env.LOG_DIR || "./data/logs"),
  RESTART_ALLOWLIST: parseList(env.RESTART_ALLOWLIST),
  UNLOCK_ALLOWLIST: parseList(env.UNLOCK_ALLOWLIST),
  POWERSHELL_PATH: env.POWERSHELL_PATH || "pwsh",
  DEFAULT_TIMEOUT_MS: parseNumber(env.DEFAULT_TIMEOUT_MS, 30_000),
  HTTP_PORT: parseNumber(env.HTTP_PORT, 3000),
  HTTP_HOST: env.HTTP_HOST || "0.0.0.0",
  HTTP_CORS_ORIGIN: env.HTTP_CORS_ORIGIN || "http://localhost:3000",
  MCP_HTTP_BACKEND_URL: env.MCP_HTTP_BACKEND_URL,
  MCP_HTTP_BACKEND_TIMEOUT_MS: parseNumber(env.MCP_HTTP_BACKEND_TIMEOUT_MS, 10_000),
  GATEWAY_URL: env.GATEWAY_URL || "http://localhost:8080",
  GATEWAY_WS_URL: env.GATEWAY_WS_URL,
  GATEWAY_WS_ORIGIN: env.GATEWAY_WS_ORIGIN,
  GATEWAY_ENABLED: env.GATEWAY_ENABLED === "true",
  GATEWAY_CHAT_PATH: env.GATEWAY_CHAT_PATH || "/api/chat/{agent}",
  GATEWAY_LOGIN_PATH: env.GATEWAY_LOGIN_PATH || "/login",
  GATEWAY_API_KEY: env.GATEWAY_API_KEY,
  GATEWAY_AUTH_HEADER: env.GATEWAY_AUTH_HEADER || "Authorization",
  LOG_LEVEL: env.LOG_LEVEL || "info",
  NODE_ENV: env.NODE_ENV || "development",
  GITHUB_TOKEN: env.GITHUB_TOKEN,
  NOTION_TOKEN: env.NOTION_TOKEN,
  DISCORD_BOT_TOKEN: env.DISCORD_BOT_TOKEN,
  DISCORD_API_BASE: env.DISCORD_API_BASE || "https://discord.com/api/v10",
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  ABDI_TELEGRAM_BOT_TOKEN: env.ABDI_TELEGRAM_BOT_TOKEN,
  AHMED_TELEGRAM_BOT_TOKEN: env.AHMED_TELEGRAM_BOT_TOKEN,
  DAME_TELEGRAM_BOT_TOKEN: env.DAME_TELEGRAM_BOT_TOKEN,
  REX_TELEGRAM_BOT_TOKEN: env.REX_TELEGRAM_BOT_TOKEN,
  PRIME_TELEGRAM_BOT_TOKEN: env.PRIME_TELEGRAM_BOT_TOKEN,
  ATLAS_TELEGRAM_BOT_TOKEN: env.ATLAS_TELEGRAM_BOT_TOKEN,
  AYUB_TELEGRAM_BOT_TOKEN: env.AYUB_TELEGRAM_BOT_TOKEN,
  SYGMA_TELEGRAM_BOT_TOKEN: env.SYGMA_TELEGRAM_BOT_TOKEN,
  TELEGRAM_API_BASE: env.TELEGRAM_API_BASE || "https://api.telegram.org",
  OPENROUTER_BASE_URL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  OPENAI_BASE_URL: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  DAME_OPENAI_API_KEY: env.DAME_OPENAI_API_KEY,
  DAME_OPENAI_MODEL_ID: env.DAME_OPENAI_MODEL_ID || "gpt-5.3-codex",
  ABDI_OPENROUTER_API_KEY: env.ABDI_OPENROUTER_API_KEY,
  AHMED_OPENROUTER_API_KEY: env.AHMED_OPENROUTER_API_KEY,
  DAME_OPENROUTER_API_KEY: env.DAME_OPENROUTER_API_KEY,
  REX_OPENROUTER_API_KEY: env.REX_OPENROUTER_API_KEY,
  PRIME_OPENROUTER_API_KEY: env.PRIME_OPENROUTER_API_KEY,
  ATLAS_OPENROUTER_API_KEY: env.ATLAS_OPENROUTER_API_KEY,
  AYUB_OPENROUTER_API_KEY: env.AYUB_OPENROUTER_API_KEY,
  SYGMA_OPENROUTER_API_KEY: env.SYGMA_OPENROUTER_API_KEY,
  ABDI_OPENROUTER_MODEL_ID: env.ABDI_OPENROUTER_MODEL_ID || "openai/gpt-4o-mini",
  AHMED_OPENROUTER_MODEL_ID: env.AHMED_OPENROUTER_MODEL_ID || "openai/gpt-4o-mini",
  DAME_OPENROUTER_MODEL_ID: env.DAME_OPENROUTER_MODEL_ID || "openai/gpt-5.3-codex",
  REX_OPENROUTER_MODEL_ID: env.REX_OPENROUTER_MODEL_ID || "openai/gpt-4o-mini",
  PRIME_OPENROUTER_MODEL_ID: env.PRIME_OPENROUTER_MODEL_ID || "openai/gpt-4o-mini",
  ATLAS_OPENROUTER_MODEL_ID: env.ATLAS_OPENROUTER_MODEL_ID || "openai/gpt-4o",
  AYUB_OPENROUTER_MODEL_ID: env.AYUB_OPENROUTER_MODEL_ID || "openai/gpt-4o-mini",
  SYGMA_OPENROUTER_MODEL_ID: env.SYGMA_OPENROUTER_MODEL_ID || "openai/gpt-4o-mini",
  GOOGLE_DRIVE_ACCESS_TOKEN: env.GOOGLE_DRIVE_ACCESS_TOKEN,
  GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: env.GOOGLE_REFRESH_TOKEN,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: normalizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
  GOOGLE_DRIVE_DEFAULT_FOLDER_ID: env.GOOGLE_DRIVE_DEFAULT_FOLDER_ID,
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
  SUPABASE_SCHEMA: env.SUPABASE_SCHEMA || "public",
  STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
  AIRTABLE_TOKEN: env.AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID: env.AIRTABLE_BASE_ID,
  N8N_BASE_URL: env.N8N_BASE_URL,
  N8N_API_KEY: env.N8N_API_KEY,
  HUBSPOT_ACCESS_TOKEN: env.HUBSPOT_ACCESS_TOKEN,
  IS_PRODUCTION: (env.NODE_ENV || "development") === "production",
} as const;

export const SESSION_DIR = config.SESSION_DIR;
export const MEMORY_DIR = config.MEMORY_DIR;
export const LOG_DIR = config.LOG_DIR;
export { PROJECT_ROOT };
export const RESTART_ALLOWLIST = config.RESTART_ALLOWLIST;
export const UNLOCK_ALLOWLIST = config.UNLOCK_ALLOWLIST;
export const POWERSHELL_PATH = config.POWERSHELL_PATH;
export const DEFAULT_TIMEOUT_MS = config.DEFAULT_TIMEOUT_MS;
export const HTTP_PORT = config.HTTP_PORT;
export const HTTP_HOST = config.HTTP_HOST;
export const HTTP_CORS_ORIGIN = config.HTTP_CORS_ORIGIN;
export const MCP_HTTP_BACKEND_URL = config.MCP_HTTP_BACKEND_URL;
export const MCP_HTTP_BACKEND_TIMEOUT_MS = config.MCP_HTTP_BACKEND_TIMEOUT_MS;
export const GATEWAY_URL = config.GATEWAY_URL;
export const GATEWAY_WS_URL = config.GATEWAY_WS_URL;
export const GATEWAY_WS_ORIGIN = config.GATEWAY_WS_ORIGIN;
export const GATEWAY_ENABLED = config.GATEWAY_ENABLED;
export const GATEWAY_CHAT_PATH = config.GATEWAY_CHAT_PATH;
export const GATEWAY_LOGIN_PATH = config.GATEWAY_LOGIN_PATH;
export const GATEWAY_API_KEY = config.GATEWAY_API_KEY;
export const GATEWAY_AUTH_HEADER = config.GATEWAY_AUTH_HEADER;
export const LOG_LEVEL = config.LOG_LEVEL;
export const NODE_ENV = config.NODE_ENV;
export const IS_PRODUCTION = config.IS_PRODUCTION;
export const GITHUB_TOKEN = config.GITHUB_TOKEN;
export const NOTION_TOKEN = config.NOTION_TOKEN;
export const DISCORD_BOT_TOKEN = config.DISCORD_BOT_TOKEN;
export const DISCORD_API_BASE = config.DISCORD_API_BASE;
export const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
export const ABDI_TELEGRAM_BOT_TOKEN = config.ABDI_TELEGRAM_BOT_TOKEN;
export const AHMED_TELEGRAM_BOT_TOKEN = config.AHMED_TELEGRAM_BOT_TOKEN;
export const DAME_TELEGRAM_BOT_TOKEN = config.DAME_TELEGRAM_BOT_TOKEN;
export const REX_TELEGRAM_BOT_TOKEN = config.REX_TELEGRAM_BOT_TOKEN;
export const PRIME_TELEGRAM_BOT_TOKEN = config.PRIME_TELEGRAM_BOT_TOKEN;
export const ATLAS_TELEGRAM_BOT_TOKEN = config.ATLAS_TELEGRAM_BOT_TOKEN;
export const AYUB_TELEGRAM_BOT_TOKEN = config.AYUB_TELEGRAM_BOT_TOKEN;
export const SYGMA_TELEGRAM_BOT_TOKEN = config.SYGMA_TELEGRAM_BOT_TOKEN;
export const TELEGRAM_API_BASE = config.TELEGRAM_API_BASE;
export const OPENROUTER_BASE_URL = config.OPENROUTER_BASE_URL;
export const OPENAI_BASE_URL = config.OPENAI_BASE_URL;
export const DAME_OPENAI_API_KEY = config.DAME_OPENAI_API_KEY;
export const DAME_OPENAI_MODEL_ID = config.DAME_OPENAI_MODEL_ID;
export const ABDI_OPENROUTER_API_KEY = config.ABDI_OPENROUTER_API_KEY;
export const AHMED_OPENROUTER_API_KEY = config.AHMED_OPENROUTER_API_KEY;
export const DAME_OPENROUTER_API_KEY = config.DAME_OPENROUTER_API_KEY;
export const REX_OPENROUTER_API_KEY = config.REX_OPENROUTER_API_KEY;
export const PRIME_OPENROUTER_API_KEY = config.PRIME_OPENROUTER_API_KEY;
export const ATLAS_OPENROUTER_API_KEY = config.ATLAS_OPENROUTER_API_KEY;
export const AYUB_OPENROUTER_API_KEY = config.AYUB_OPENROUTER_API_KEY;
export const SYGMA_OPENROUTER_API_KEY = config.SYGMA_OPENROUTER_API_KEY;
export const ABDI_OPENROUTER_MODEL_ID = config.ABDI_OPENROUTER_MODEL_ID;
export const AHMED_OPENROUTER_MODEL_ID = config.AHMED_OPENROUTER_MODEL_ID;
export const DAME_OPENROUTER_MODEL_ID = config.DAME_OPENROUTER_MODEL_ID;
export const REX_OPENROUTER_MODEL_ID = config.REX_OPENROUTER_MODEL_ID;
export const PRIME_OPENROUTER_MODEL_ID = config.PRIME_OPENROUTER_MODEL_ID;
export const ATLAS_OPENROUTER_MODEL_ID = config.ATLAS_OPENROUTER_MODEL_ID;
export const AYUB_OPENROUTER_MODEL_ID = config.AYUB_OPENROUTER_MODEL_ID;
export const SYGMA_OPENROUTER_MODEL_ID = config.SYGMA_OPENROUTER_MODEL_ID;
export const GOOGLE_DRIVE_ACCESS_TOKEN = config.GOOGLE_DRIVE_ACCESS_TOKEN;
export const GOOGLE_CLIENT_ID = config.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET = config.GOOGLE_CLIENT_SECRET;
export const GOOGLE_REFRESH_TOKEN = config.GOOGLE_REFRESH_TOKEN;
export const GOOGLE_SERVICE_ACCOUNT_EMAIL = config.GOOGLE_SERVICE_ACCOUNT_EMAIL;
export const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
export const GOOGLE_DRIVE_DEFAULT_FOLDER_ID = config.GOOGLE_DRIVE_DEFAULT_FOLDER_ID;
export const SUPABASE_URL = config.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = config.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
export const SUPABASE_SCHEMA = config.SUPABASE_SCHEMA;
export const STRIPE_SECRET_KEY = config.STRIPE_SECRET_KEY;
export const AIRTABLE_TOKEN = config.AIRTABLE_TOKEN;
export const AIRTABLE_BASE_ID = config.AIRTABLE_BASE_ID;
export const N8N_BASE_URL = config.N8N_BASE_URL;
export const N8N_API_KEY = config.N8N_API_KEY;
export const HUBSPOT_ACCESS_TOKEN = config.HUBSPOT_ACCESS_TOKEN;

export function normalizePath(p: string): string {
  if (process.platform === "win32") return p;
  return p;
}

export function getPlatform(): "windows" | "linux" | "macos" {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "macos";
  return "linux";
}
