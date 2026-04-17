#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { Client } from "pg";

const root = process.cwd();
const migrationsDir = path.join(root, "db", "migrations");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run memory migrations.");
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const client = new Client({ connectionString: databaseUrl, ssl: process.env.MEMORY_DB_SSL === "true" ? { rejectUnauthorized: false } : undefined });

async function run() {
  await client.connect();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`Applying ${file}...`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      process.stdout.write("done\n");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }
  await client.end();
}

run().catch(async (err) => {
  console.error("Migration failed:", err?.message || err);
  try { await client.end(); } catch {}
  process.exit(1);
});
