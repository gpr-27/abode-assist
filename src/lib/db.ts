import "server-only";
import pg from "pg";

/**
 * Database access: node-postgres behind a small tagged-template API
 *   sql<Row[]>`select … where id = ${id}`      → parameterised ($1, $2 …), never string-built
 *   sql.begin(async (tx) => { await tx`…` })   → BEGIN / COMMIT, ROLLBACK on throw
 *   sql.json(value)                            → a JSON parameter
 *   sql(array)                                 → an IN-list: where id in ${sql(ids)}
 *
 * Why not postgres.js: it pipelines queries on a connection, and through Supabase's transaction
 * pooler (port 6543) concurrent pipelined queries hang (reproduced with 20 parallel selects, even
 * with one connection). node-postgres sends one query at a time per connection, so the
 * transaction pooler works and we are not capped by the session pooler's 15 clients.
 */

class Json { constructor(public value: unknown) {} }
class InList { constructor(public values: readonly unknown[]) {} }

type Row = Record<string, unknown>;
type Query = <T = Row[]>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;

function compile(strings: TemplateStringsArray, values: unknown[]) {
  let text = strings[0];
  const params: unknown[] = [];
  values.forEach((v, i) => {
    if (v instanceof InList) {
      if (v.values.length === 0) text += "(null)"; // `x in (null)` matches nothing
      else text += `(${v.values.map((x) => { params.push(x); return `$${params.length}`; }).join(", ")})`;
    } else {
      params.push(v instanceof Json ? JSON.stringify(v.value) : v === undefined ? null : v);
      text += `$${params.length}`;
    }
    text += strings[i + 1];
  });
  return { text, params };
}

function runner(exec: (text: string, params: unknown[]) => Promise<pg.QueryResult>): Query {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const { text, params } = compile(strings, values);
    const res = await exec(text, params);
    return res.rows;
  }) as Query;
}

export type Tx = Query & { json: (v: unknown) => Json };
export type Sql = Query & {
  (list: readonly unknown[]): InList;
  json: (v: unknown) => Json;
  begin: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  end: (opts?: { timeout?: number }) => Promise<void>;
};

declare global {
  var __abodePool: pg.Pool | undefined;
  var __abodeTypesReady: Promise<void> | undefined;
}

function pool(): pg.Pool {
  if (globalThis.__abodePool) return globalThis.__abodePool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const p = new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  p.on("error", (e) => console.error("pg pool error", e.message));
  globalThis.__abodePool = p;
  return p;
}

/** Parse arrays of our enum types (e.g. array_agg(source)) into JS arrays, like text[]. */
function typesReady(): Promise<void> {
  if (!globalThis.__abodeTypesReady) {
    globalThis.__abodeTypesReady = pool()
      .query<{ typarray: number }>(`select t.typarray from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'e' and n.nspname = 'app'`)
      .then((r) => {
        const types = pg.types as unknown as { getTypeParser: (oid: number) => (v: string) => unknown; setTypeParser: (oid: number, f: (v: string) => unknown) => void };
        const textArray = types.getTypeParser(1009); // text[]
        for (const { typarray } of r.rows) types.setTypeParser(typarray, textArray);
      })
      .catch((e) => { globalThis.__abodeTypesReady = undefined; throw e; });
  }
  return globalThis.__abodeTypesReady;
}

const base = runner(async (text, params) => {
  await typesReady();
  return pool().query(text, params);
});

export const sql = Object.assign(
  ((first: TemplateStringsArray | readonly unknown[], ...rest: unknown[]) =>
    Array.isArray(first) && !("raw" in first) ? new InList(first) : base(first as TemplateStringsArray, ...rest)) as Sql,
  {
    json: (v: unknown) => new Json(v),
    async begin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      await typesReady();
      const client = await pool().connect();
      const tx = Object.assign(runner((text, params) => client.query(text, params)), { json: (v: unknown) => new Json(v) }) as Tx;
      try {
        await client.query("begin");
        const out = await fn(tx);
        await client.query("commit");
        return out;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async end() {
      const p = globalThis.__abodePool;
      globalThis.__abodePool = undefined;
      globalThis.__abodeTypesReady = undefined;
      await p?.end();
    },
  },
);

/** Postgres raises our own business errors (e.g. SLOT_FULL) as P0001 with the code in the message. */
export function dbErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const e = err as { code?: string; message?: string; constraint?: string; constraint_name?: string };
    if (e.code === "P0001" && e.message) return e.message;
    if (e.code === "23505") return `UNIQUE:${e.constraint ?? e.constraint_name ?? ""}`;
  }
  return null;
}
