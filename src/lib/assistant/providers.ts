import "server-only";
import { generateText, isStepCount, type ModelMessage, type ToolSet, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Five-step provider chain, strict priority (never load-balanced):
 *   1. Anthropic  claude-sonnet-5-5           (paid; no output cap, no client-side limits)
 *   2. Groq key 1 gpt-oss-120b → gpt-oss-20b → qwen3.8-27b   (free tier limits)
 *   3. Groq key 2 same models
 *   4. Gemini key 1 gemini-3.8-flash → 3.6-flash → 3.1-flash-lite (free tier; no personal data)
 *   5. Gemini key 2 same models
 * A step whose key is missing is skipped. 401/403 skips the rest of that key's models.
 */

type CallSettings = {
  maxOutputTokens?: number;
  temperature?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions?: Record<string, Record<string, any>>;
};

type StepName = "anthropic" | "groq #1" | "groq #2" | "gemini #1" | "gemini #2";

type Step = {
  name: StepName;
  envKey: string;
  models: string[];
  /** Free tiers may train on prompts or have tight quotas: personal data never goes there. */
  personalDataAllowed: boolean;
  make: (apiKey: string, model: string) => LanguageModel;
  settings: (model: string) => CallSettings;
  /** Client-side cooldowns after a 429; Sonnet is exempt by design. */
  rateLimited: boolean;
};

const CALL_TIMEOUT_MS = 25_000;
const TOTAL_BUDGET_MS = 50_000;

const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite"];

const groqSettings = (model: string): CallSettings => ({
  // Reasoning tokens count as output; below 2048 GPT-OSS can return an empty reply.
  maxOutputTokens: model.startsWith("qwen/") ? 4096 : 3072,
  temperature: 0.4,
  providerOptions: { groq: model.startsWith("qwen/") ? { reasoningEffort: "none" } : { reasoningEffort: "low", parallelToolCalls: false } },
});

const geminiSettings = (): CallSettings => ({
  maxOutputTokens: 4096, // includes thinking
  // Thinking cannot be disabled on 3.8; "low" keeps replies inside the call timeout.
  providerOptions: { google: { thinkingConfig: { thinkingLevel: "low", includeThoughts: false } } },
});

const STEPS: Step[] = [
  {
    name: "anthropic", envKey: "ANTHROPIC_API_KEY", models: ["claude-sonnet-5-5"], personalDataAllowed: true, rateLimited: false,
    make: (apiKey, model) => createAnthropic({ apiKey })(model),
    // No maxOutputTokens, no effort cap: Sonnet runs without limits.
    settings: () => ({}),
  },
  { name: "groq #1", envKey: "GROQ_API_KEY", models: GROQ_MODELS, personalDataAllowed: true, rateLimited: true, make: (k, m) => createGroq({ apiKey: k })(m), settings: groqSettings },
  { name: "groq #2", envKey: "GROQ_API_KEY_2", models: GROQ_MODELS, personalDataAllowed: true, rateLimited: true, make: (k, m) => createGroq({ apiKey: k })(m), settings: groqSettings },
  { name: "gemini #1", envKey: "GEMINI_API_KEY", models: GEMINI_MODELS, personalDataAllowed: false, rateLimited: true, make: (k, m) => createGoogleGenerativeAI({ apiKey: k })(m), settings: geminiSettings },
  { name: "gemini #2", envKey: "GEMINI_API_KEY_2", models: GEMINI_MODELS, personalDataAllowed: false, rateLimited: true, make: (k, m) => createGoogleGenerativeAI({ apiKey: k })(m), settings: geminiSettings },
];

/** key+model → epoch ms until which we don't try it again (per server instance). */
const cooldown = new Map<string, number>();

function statusOf(err: unknown): number | undefined {
  const e = err as { statusCode?: number; status?: number; lastError?: { statusCode?: number }; cause?: { statusCode?: number } };
  return e?.statusCode ?? e?.status ?? e?.lastError?.statusCode ?? e?.cause?.statusCode;
}

function retryAfterMs(err: unknown): number {
  const h = (err as { responseHeaders?: Record<string, string> })?.responseHeaders;
  const ra = h?.["retry-after"];
  const s = ra ? Number(ra) : NaN;
  if (Number.isFinite(s)) return Math.min(s, 3600) * 1000;
  const msg = String((err as Error)?.message ?? "");
  return /day|daily|quota/i.test(msg) ? 60 * 60_000 : 60_000;
}

/** Remove phone numbers, e-mails and the buyer's name before a free-tier provider sees the text. */
export function redact(text: string, names: string[] = []): string {
  let t = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, "[phone]");
  for (const n of names.filter((x) => x && x.length > 1)) {
    for (const part of n.split(/\s+/).filter((p) => p.length > 2)) {
      t = t.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[name]");
    }
  }
  return t;
}

function redactMessages(msgs: ModelMessage[], names: string[]): ModelMessage[] {
  return msgs.map((m) => {
    if (typeof m.content === "string") return { ...m, content: redact(m.content, names) } as ModelMessage;
    return m;
  });
}

export type ChainResult = {
  text: string;
  provider: StepName;
  model: string;
  steps: Awaited<ReturnType<typeof generateText>>["steps"];
  attempts: { step: string; model: string; error: string }[];
};

export type ChainInput = {
  instructions: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  maxSteps?: number;
  /** Names to strip for providers that must not receive personal data. */
  personalNames?: string[];
  /** Called before trying the next provider; return false to stop (e.g. a side-effect tool already ran). */
  canFallThrough?: () => boolean;
};

export class AllProvidersFailed extends Error {
  constructor(public attempts: ChainResult["attempts"]) {
    super(`All LLM providers failed (${attempts.length} attempts)`);
  }
}

export function configuredProviders(): string[] {
  return STEPS.filter((s) => process.env[s.envKey]?.trim()).map((s) => s.name);
}

export async function runChain(input: ChainInput): Promise<ChainResult> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const attempts: ChainResult["attempts"] = [];

  for (const step of STEPS) {
    const apiKey = process.env[step.envKey]?.trim();
    if (!apiKey) continue;
    for (const model of step.models) {
      if (Date.now() > deadline) throw new AllProvidersFailed(attempts);
      if (input.canFallThrough && attempts.length > 0 && !input.canFallThrough()) throw new AllProvidersFailed(attempts);
      const ck = `${step.envKey}:${model}`;
      if (step.rateLimited && (cooldown.get(ck) ?? 0) > Date.now()) continue;

      const names = input.personalNames ?? [];
      const instructions = step.personalDataAllowed ? input.instructions : redact(input.instructions, names);
      const messages = step.personalDataAllowed ? input.messages : redactMessages(input.messages, names);
      try {
        const result = await generateText({
          model: step.make(apiKey, model),
          instructions,
          messages,
          tools: input.tools,
          stopWhen: isStepCount(input.maxSteps ?? 6),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(step.name === "anthropic" ? TOTAL_BUDGET_MS : CALL_TIMEOUT_MS),
          ...step.settings(model),
        });
        const text = result.text.trim();
        const usedTools = result.steps.some((s) => s.toolCalls.length > 0);
        if (!text && !usedTools) throw new Error("empty completion");
        if (result.finishReason === "content-filter") throw new Error("refusal");
        return { text, provider: step.name, model, steps: result.steps, attempts };
      } catch (err) {
        const status = statusOf(err);
        const msg = String((err as Error)?.message ?? err).slice(0, 200);
        attempts.push({ step: step.name, model, error: `${status ?? ""} ${msg}`.trim() });
        console.error(`llm ${step.name} ${model}: ${status ?? ""} ${msg}`);
        if (status === 429 && step.rateLimited) cooldown.set(ck, Date.now() + retryAfterMs(err));
        if (status === 401 || status === 403 || status === 402) break; // bad key / no credit: next step
      }
    }
  }
  throw new AllProvidersFailed(attempts);
}
