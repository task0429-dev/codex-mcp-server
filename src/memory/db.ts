const { Pool } = require("pg");
import { DATABASE_URL, MEMORY_DB_SSL } from "../config";
import { logger } from "../core/logger";

let pool: any = null;

export function getMemoryPool(): any {
  if (!DATABASE_URL) {
    return null;
  }

  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: MEMORY_DB_SSL ? { rejectUnauthorized: false } : undefined,
    max: 8,
  });

  pool.on("error", (err: any) => {
    logger.error("memory_db_pool_error", { message: err.message });
  });

  return pool;
}

export async function checkMemoryDbHealth(): Promise<{ configured: boolean; reachable: boolean }> {
  const db = getMemoryPool();
  if (!db) {
    return { configured: false, reachable: false };
  }

  try {
    await db.query("select 1");
    return { configured: true, reachable: true };
  } catch (err: any) {
    logger.warn("memory_db_unreachable", { message: err?.message || String(err) });
    return { configured: true, reachable: false };
  }
}

