// Health check for each step of the LLM chain: pnpm llm:check GROQ_API_KEY  (keeps only that key, runs one tool call)
import { config } from "dotenv";
config({ path: ".env.local" });
import { tool } from "ai";
import { z } from "zod";
const only = process.argv[2];
for (const k of ["ANTHROPIC_API_KEY","GROQ_API_KEY","GROQ_API_KEY_2","GEMINI_API_KEY","GEMINI_API_KEY_2"]) if (k !== only) delete process.env[k];
const { runChain } = await import("../src/lib/assistant/providers.ts");
let called = "";
const t0 = Date.now();
try {
  const r = await runChain({
    instructions: "You book site visits. Always call get_free_slots before offering times. Reply in one short sentence in the user's language.",
    messages: [{ role: "user", content: "मुझे रविवार सुबह विज़िट करनी है, मेरा नंबर 9825011111 है" }],
    tools: { get_free_slots: tool({ description: "List free slots", inputSchema: z.object({ part_of_day: z.enum(["morning","afternoon","evening","any"]) }),
      execute: async (i) => { called = JSON.stringify(i); return { slots: ["Sun 10:00", "Sun 11:00"] }; } }) },
  });
  console.log(only, "→", r.provider, r.model, `${Date.now()-t0}ms`, "tool:", called, "|", r.text.slice(0,120), "| failed attempts:", r.attempts.length);
} catch (e) { console.log(only, "FAILED", (e as any).attempts ?? (e as Error).message); }
