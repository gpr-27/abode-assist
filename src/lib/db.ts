import "server-only";
import postgres from "postgres";

declare global {
  var __abodeSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    // Use Supabase's session pooler (port 5432). postgres.js pipelines queries on a connection,
    // and through the transaction pooler (6543) concurrent queries were seen to hang (see TDD).
    // A small pool per instance keeps us inside the session pool limit.
    prepare: false,
    max: 3,
    idle_timeout: 10,
    max_lifetime: 60 * 10,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

/** One pooled client per server instance (reused across hot reloads in dev). */
export const sql = globalThis.__abodeSql ?? (globalThis.__abodeSql = createClient());

export type Sql = typeof sql;
export type Tx = postgres.TransactionSql;

/** Postgres raises our own business errors (e.g. SLOT_FULL) as P0001 with the code in the message. */
export function dbErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const e = err as { code?: string; message?: string; constraint_name?: string };
    if (e.code === "P0001" && e.message) return e.message;
    if (e.code === "23505") return `UNIQUE:${e.constraint_name ?? ""}`;
  }
  return null;
}
