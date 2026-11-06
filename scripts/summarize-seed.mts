// After seeding: write real AI handoff summaries for the seeded chats, using the app's own summariser.
// Usage: pnpm db:summaries
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { sql } = await import("../src/lib/db");
const { summarizeLead } = await import("../src/lib/assistant/summary");
const convs = await sql<{ id: string; name: string }[]>`
  select c.id, l.name from conversations c join leads l on l.id = c.lead_id where c.handoff_at is not null`;
for (const c of convs) {
  await summarizeLead(c.id);
  const [l] = await sql<{ summary: string | null }[]>`select l.summary from conversations c join leads l on l.id = c.lead_id where c.id = ${c.id}`;
  const s = l?.summary ? JSON.parse(l.summary) : null;
  console.log(`${c.name}: ${s ? `${s.intent} · ${s.generatedBy}` : "no summary"}`);
}
await sql.end();
