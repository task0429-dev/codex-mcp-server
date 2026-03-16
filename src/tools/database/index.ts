import { z } from "zod";
import { hubConfig } from "../../config/hub-config";
import { ToolDefinition } from "../../types/tool";
import { ToolError } from "../../utils/errors";
import { ensurePathAllowed } from "../../utils/paths";
import { project2CrmTools } from "./project2-crm";

const group = "database";

const EngineSchema = z.enum(["postgres", "sqlite"]);

const QuerySchema = z.object({
  engine: EngineSchema,
  query: z.string().min(1),
  sqlite_path: z.string().optional(),
});

const TablesSchema = z.object({
  engine: EngineSchema,
  sqlite_path: z.string().optional(),
});

const SchemaSchema = z.object({
  engine: EngineSchema,
  table: z.string().optional(),
  sqlite_path: z.string().optional(),
});

function ensureReadOnlyQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  const allowedPrefixes = ["select", "with", "explain", "pragma"];
  if (allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return;
  }

  if (!hubConfig.database.allowWrite) {
    throw new ToolError("Database tools are read-only by default. Set DATABASE_ALLOW_WRITE=true to permit writes.", {
      code: "permission_denied",
      statusCode: 403,
    });
  }
}

async function importPg() {
  try {
    const moduleName = "pg";
    return await import(moduleName);
  } catch {
    throw new ToolError("PostgreSQL support requires the 'pg' package. Run npm install after updating package.json.", {
      code: "dependency_missing",
      statusCode: 503,
    });
  }
}

async function runPostgresQuery(query: string) {
  if (!hubConfig.database.postgresUrl) {
    throw new ToolError("POSTGRES_URL is not configured.", {
      code: "dependency_missing",
      statusCode: 503,
    });
  }

  const { Client } = await importPg();
  const client = new Client({
    connectionString: hubConfig.database.postgresUrl,
    statement_timeout: hubConfig.database.queryTimeoutMs,
  });
  await client.connect();
  try {
    const result = await client.query(query);
    return {
      rowCount: result.rowCount,
      rows: result.rows,
      fields: result.fields?.map((field: any) => field.name) || [],
    };
  } finally {
    await client.end();
  }
}

async function runSqliteQuery(sqlitePath: string, query: string) {
  const allowedRoots = hubConfig.database.sqliteAllowedPaths.length > 0 ? hubConfig.database.sqliteAllowedPaths : hubConfig.filesystem.allowedRoots;
  const safePath = ensurePathAllowed(sqlitePath, allowedRoots, hubConfig.filesystem.deniedPaths);
  let sqliteModule: any;
  try {
    const moduleName = "node:sqlite";
    sqliteModule = await import(moduleName);
  } catch {
    throw new ToolError("This Node runtime does not expose node:sqlite.", {
      code: "dependency_missing",
      statusCode: 503,
    });
  }

  const db = new sqliteModule.DatabaseSync(safePath);
  try {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.startsWith("select") || trimmed.startsWith("pragma") || trimmed.startsWith("with") || trimmed.startsWith("explain")) {
      const statement = db.prepare(query);
      return {
        rows: statement.all(),
      };
    }

    if (!hubConfig.database.allowWrite) {
      throw new ToolError("SQLite writes are disabled by policy.", {
        code: "permission_denied",
        statusCode: 403,
      });
    }

    const result = db.exec(query);
    return { result };
  } finally {
    db.close();
  }
}

export const databaseTools: ToolDefinition[] = [
  ...project2CrmTools,
  {
    name: "database_list_targets",
    description: "List configured database targets and readiness state.",
    inputSchema: z.object({}),
    group,
    handler: async () => ({
      postgres_configured: Boolean(hubConfig.database.postgresUrl),
      sqlite_allowed_paths: hubConfig.database.sqliteAllowedPaths,
      read_only_default: !hubConfig.database.allowWrite,
    }),
  },
  {
    name: "database_query",
    description: "Run a database query with read-only defaults.",
    inputSchema: QuerySchema,
    group,
    handler: async (input) => {
      ensureReadOnlyQuery(input.query);
      if (input.engine === "postgres") {
        return runPostgresQuery(input.query);
      }
      if (!input.sqlite_path) {
        throw new ToolError("sqlite_path is required for SQLite queries.", {
          code: "bad_request",
          statusCode: 400,
        });
      }
      return runSqliteQuery(input.sqlite_path, input.query);
    },
  },
  {
    name: "database_list_tables",
    description: "List tables for PostgreSQL or SQLite.",
    inputSchema: TablesSchema,
    group,
    handler: async (input) => {
      if (input.engine === "postgres") {
        return runPostgresQuery(
          "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') order by table_schema, table_name;"
        );
      }
      if (!input.sqlite_path) {
        throw new ToolError("sqlite_path is required for SQLite table listing.", {
          code: "bad_request",
          statusCode: 400,
        });
      }
      return runSqliteQuery(input.sqlite_path, "select name, type from sqlite_master where type in ('table', 'view') order by name;");
    },
  },
  {
    name: "database_inspect_schema",
    description: "Inspect table metadata for PostgreSQL or SQLite.",
    inputSchema: SchemaSchema,
    group,
    handler: async (input) => {
      if (input.engine === "postgres") {
        if (!input.table) {
          return runPostgresQuery(
            "select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema not in ('pg_catalog', 'information_schema') order by table_schema, table_name, ordinal_position;"
          );
        }
        return runPostgresQuery(
          `select table_schema, table_name, column_name, data_type from information_schema.columns where table_name = '${input.table.replace(/'/g, "''")}' order by ordinal_position;`
        );
      }
      if (!input.sqlite_path) {
        throw new ToolError("sqlite_path is required for SQLite schema inspection.", {
          code: "bad_request",
          statusCode: 400,
        });
      }
      if (!input.table) {
        return runSqliteQuery(input.sqlite_path, "select name, sql from sqlite_master where type='table' order by name;");
      }
      return runSqliteQuery(input.sqlite_path, `pragma table_info('${input.table.replace(/'/g, "''")}');`);
    },
  },
];
