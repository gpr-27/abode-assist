import { readFileSync } from "node:fs";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DIRECT_DATABASE_URL or DATABASE_URL is required");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const reset = process.argv.includes("--reset");

async function main() {
  if (reset) {
    await sql.unsafe("drop schema if exists app cascade; create schema app;");
    console.log("schema app reset");
  }
  await sql.unsafe(readFileSync("db/schema.sql", "utf8"));
  console.log("schema applied");
  await sql.end();
}
main().catch(async (e) => { console.error(e.message); await sql.end(); process.exit(1); });
