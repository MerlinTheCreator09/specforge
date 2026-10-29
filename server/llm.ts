// The ONLY place that talks to an AI provider. Everything else calls generateJson().
// The key arrives per request from the browser. Never store it, log it or return it.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { Request } from "express";
import type { ZodType } from "zod";
import { ApiError } from "./envelope.js";

export type Provider = "gemini" | "openrouter" | "anthropic";
export type LlmConfig = { provider: Provider; key: string; model: string };

export const DEFAULT_MODELS = { gemini: "gemini-2.5-flash", openrouter: "google/gemini-2.5-flash", anthropic: "claude-sonnet-5-5" } as const;

export function configFromRequest(req: Request): LlmConfig {
  const provider = String(req.header("x-llm-provider") ?? "").toLowerCase();
  const key = String(req.header("x-llm-key") ?? "").trim();
  const model = String(req.header("x-llm-model") ?? "").trim();
  if (!key) throw new ApiError(400, "MISSING_KEY", "Add your key in Settings.");
  if (provider !== "gemini" && provider !== "openrouter" && provider !== "anthropic") throw new ApiError(400, "BAD_PROVIDER", "Choose gemini, openrouter or anthropic in Settings.");
  return { provider, key, model: model || DEFAULT_MODELS[provider] };
}

const TIMEOUT_MS = 180_000;

// Network failures and timeouts: a fixed message, never the request (which carries the key).
function networkError(): never {
  throw new ApiError(504, "PROVIDER_UNREACHABLE", "Could not reach the AI provider in time. Try again.");
}

// The provider's own reason, with the key scrubbed out and trimmed, so the user can act on it.
function reason(text: unknown, cfg: LlmConfig): string {
  let t = String(text ?? "").split(cfg.key).join("[key]").replace(/\s+/g, " ").trim();
  try { const j = JSON.parse(t.replace(/^\d{3}\s*/, "")); t = j?.error?.message ?? j?.message ?? t; } catch { /* not JSON */ }
  return t.slice(0, 300) || "no details";
}

function fail(status: number, cfg: LlmConfig, detail: string): never {
  console.error(`[llm] ${cfg.provider} ${cfg.model} -> ${status || "error"}: ${detail}`); // never the key or headers
  if (status === 429 || status === 529) throw new ApiError(429, "RATE_LIMITED", `The AI provider is busy or rate-limited (${detail}). Wait a minute or switch model.`);
  if (status === 401 || status === 403) throw new ApiError(401, "BAD_KEY", `The provider rejected this key (${detail}). Check Settings.`);
  if (status === 404) throw new ApiError(400, "BAD_MODEL", `The provider does not offer the model "${cfg.model}" (${detail}). Fix the model name in Settings.`);
  if (status === 400) throw new ApiError(400, "PROVIDER_REJECTED", `The provider rejected the request: ${detail}`);
  throw new ApiError(502, "PROVIDER_ERROR", `The AI provider failed${status ? ` (HTTP ${status})` : ""}: ${detail}`);
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

async function callAnthropic(prompt: string, cfg: LlmConfig): Promise<string> {
  // Official SDK: retries 429/5xx/overloaded twice by itself; streaming avoids HTTP timeouts on long JSON replies.
  const client = new Anthropic({ apiKey: cfg.key, timeout: TIMEOUT_MS, maxRetries: 2 });
  try {
    const msg = await client.beta.messages.stream({
      model: cfg.model,
      max_tokens: 32000,
      output_config: { effort: "medium" },
      // Server-side fallback: if a safety classifier declines, the API re-runs the request on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    } as any).finalMessage();
    if (msg.stop_reason === "refusal") throw new ApiError(502, "AI_REFUSED", "The AI declined this request. Try again or pick another model.");
    if (msg.stop_reason === "max_tokens") throw new ApiError(502, "AI_TRUNCATED", "The AI reply was cut off before it finished. Try again.");
    return msg.content.flatMap((b: any) => (b.type === "text" ? [b.text as string] : [])).join("");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Anthropic.APIConnectionError) networkError(); // includes timeouts
    if (e instanceof Anthropic.APIError) fail(e.status ?? 0, cfg, reason(e.message, cfg));
    throw e;
  }
}

const RETRYABLE = new Set(["RATE_LIMITED", "PROVIDER_ERROR", "PROVIDER_UNREACHABLE"]);
const RETRY_DELAYS_MS = [2_000, 5_000, 12_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Busy or flaky providers (503 "high demand", 429, 5xx, timeouts) are usually fine a few seconds later.
// Anthropic's SDK retries on its own; Gemini and OpenRouter get the same treatment here. If a chosen Gemini model
// stays overloaded, fall back once to the default Gemini model so a scorer run still completes.
async function callProvider(prompt: string, cfg: LlmConfig): Promise<string> {
  if (cfg.provider === "anthropic") return callAnthropic(prompt, cfg);
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(prompt, cfg);
    } catch (e) {
      if (!(e instanceof ApiError) || !RETRYABLE.has(e.code)) throw e;
      if (attempt < RETRY_DELAYS_MS.length) { await sleep(RETRY_DELAYS_MS[attempt]); continue; }
      const fallback = DEFAULT_MODELS[cfg.provider];
      if (cfg.model !== fallback) {
        console.error(`[llm] ${cfg.provider} ${cfg.model} still failing; trying ${fallback}`);
        return callProvider(prompt, { ...cfg, model: fallback });
      }
      throw e;
    }
  }
}

async function callOnce(prompt: string, cfg: LlmConfig): Promise<string> {
  if (cfg.provider === "gemini") {
    try {
      const ai = new GoogleGenAI({ apiKey: cfg.key });
      const r = await ai.models.generateContent({ model: cfg.model, contents: prompt, config: { responseMimeType: "application/json", abortSignal: AbortSignal.timeout(TIMEOUT_MS) } });
      return r.text ?? "";
    } catch (e: any) {
      fail(Number(e?.status ?? e?.code ?? 0), cfg, reason(e?.message, cfg));
    }
  }
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(networkError);
  if (!r.ok) fail(r.status, cfg, reason(await r.text().catch(() => ""), cfg));
  const j: any = await r.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

export async function generateJson<T>(prompt: string, schema: ZodType<T>, cfg: LlmConfig): Promise<T> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const suffix = attempt === 0 ? "" : `\n\nYour previous answer was invalid: ${last}. Reply with valid JSON only.`;
    const raw = await callProvider(prompt + "\n\nReply with JSON only, no commentary." + suffix, cfg);
    try {
      const parsed = schema.safeParse(JSON.parse(stripFences(raw)));
      if (parsed.success) return parsed.data;
      last = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      last = "not parseable JSON";
    }
  }
  throw new ApiError(502, "BAD_AI_OUTPUT", "The AI did not return valid JSON. Try again or pick another model.");
}
