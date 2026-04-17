const { Pool } = require("pg");
import fs from "fs";
import path from "path";
import { DATABASE_URL, MEMORY_DB_SSL, PROJECT_ROOT } from "../config";
import { logger } from "../core/logger";

let pool: any = null;

type BillingFileState = {
  events: Record<string, any>;
  customers: Record<string, any>;
  subscriptions: Record<string, any>;
  checkoutSessions: Record<string, any>;
};

const BILLING_DATA_DIR = path.resolve(PROJECT_ROOT, "data", "billing");
const BILLING_STATE_FILE = path.join(BILLING_DATA_DIR, "state.json");

const EMPTY_STATE: BillingFileState = {
  events: {},
  customers: {},
  subscriptions: {},
  checkoutSessions: {},
};

export function getBillingPool(): any {
  if (!DATABASE_URL) return null;
  if (pool) return pool;

  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: MEMORY_DB_SSL ? { rejectUnauthorized: false } : undefined,
    max: 8,
  });

  pool.on("error", (err: Error) => {
    logger.error("billing_db_pool_error", { message: err.message });
  });

  return pool;
}

export async function ensureBillingSchema(): Promise<{ configured: boolean; ready: boolean; storageMode: "postgres" | "file" }> {
  const db = getBillingPool();
  if (!db) {
    await fs.promises.mkdir(BILLING_DATA_DIR, { recursive: true });
    if (!fs.existsSync(BILLING_STATE_FILE)) {
      await fs.promises.writeFile(BILLING_STATE_FILE, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
    }
    return { configured: false, ready: true, storageMode: "file" };
  }

  await db.query(`
    create table if not exists billing_events (
      stripe_event_id text primary key,
      event_type text not null,
      object_id text,
      livemode boolean not null default false,
      created_ts timestamptz,
      payload jsonb not null,
      processed_at timestamptz not null default now()
    );
  `);

  await db.query(`
    create table if not exists billing_customers (
      stripe_customer_id text primary key,
      email text,
      name text,
      metadata jsonb not null default '{}'::jsonb,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.query(`
    create table if not exists billing_subscriptions (
      stripe_subscription_id text primary key,
      stripe_customer_id text not null references billing_customers(stripe_customer_id) on delete cascade,
      stripe_price_id text,
      status text not null,
      cancel_at timestamptz,
      canceled_at timestamptz,
      current_period_start timestamptz,
      current_period_end timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.query(`
    create table if not exists billing_checkout_sessions (
      stripe_checkout_session_id text primary key,
      stripe_customer_id text references billing_customers(stripe_customer_id) on delete set null,
      stripe_subscription_id text,
      customer_email text,
      mode text not null,
      status text,
      payment_status text,
      stripe_price_id text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.query(`create index if not exists idx_billing_customers_email on billing_customers(email);`);
  await db.query(`create index if not exists idx_billing_subscriptions_customer on billing_subscriptions(stripe_customer_id);`);
  await db.query(`create index if not exists idx_billing_checkout_customer on billing_checkout_sessions(stripe_customer_id);`);

  return { configured: true, ready: true, storageMode: "postgres" };
}

export async function readBillingFileState(): Promise<BillingFileState> {
  await fs.promises.mkdir(BILLING_DATA_DIR, { recursive: true });
  if (!fs.existsSync(BILLING_STATE_FILE)) {
    await fs.promises.writeFile(BILLING_STATE_FILE, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
    return structuredClone(EMPTY_STATE);
  }

  const raw = await fs.promises.readFile(BILLING_STATE_FILE, "utf8");
  if (!raw.trim()) return structuredClone(EMPTY_STATE);

  try {
    const parsed = JSON.parse(raw) as Partial<BillingFileState>;
    return {
      events: parsed.events || {},
      customers: parsed.customers || {},
      subscriptions: parsed.subscriptions || {},
      checkoutSessions: parsed.checkoutSessions || {},
    };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export async function writeBillingFileState(state: BillingFileState): Promise<void> {
  await fs.promises.mkdir(BILLING_DATA_DIR, { recursive: true });
  await fs.promises.writeFile(BILLING_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}
