import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pushLog, currentSessionId } from "./agent-log.server";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "nvidia/nvidia-nemotron-nano-9b-v2";

/**
 * Estimated USD cost per 1 million tokens for {@link MODEL}.
 *
 * These are reasonable build.nvidia.com paid-tier estimates for the
 * Nemotron Nano 9B class. Used purely for the in-app cost meter on the
 * agent dashboard; not a billing source of truth.
 */
const COST_PER_M_INPUT_USD = 0.2;
const COST_PER_M_OUTPUT_USD = 0.4;

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_M_INPUT_USD +
    (outputTokens / 1_000_000) * COST_PER_M_OUTPUT_USD
  );
}

/**
 * Vite's vite.config.ts runs in a different process than TanStack Start server
 * functions. Reading `.dev.vars` here ensures Nemotron calls see NVIDIA_API_KEY in dev.
 */
function loadProjectDevVars() {
  const devVarsPath = resolve(process.cwd(), ".dev.vars");
  if (!existsSync(devVarsPath)) return;

  const contents = readFileSync(devVarsPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;

    const existing = process.env[key];
    if (existing !== undefined && existing !== "") continue;

    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");

    process.env[key] = value;
  }
}

loadProjectDevVars();

/** Sleep for `ms` milliseconds. */
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper around a fetch call.
 * On 429 (rate-limit) or 5xx (server error) we wait and retry with
 * exponential backoff: 1s → 2s → 4s (3 attempts total).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 3,
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    // Don't retry client errors (4xx) except rate-limit (429)
    if (res.status !== 429 && res.status < 500) return res;
    lastRes = res;
    if (attempt < maxAttempts - 1) {
      const waitMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      await sleep(waitMs);
    }
  }
  return lastRes!;
}

export async function callNemotron(
  systemPrompt: string,
  userMessage: string,
  temperature = 0.7,
  maxTokens = 800,
  agent = "AI",
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured");
  const sid = currentSessionId();
  const corrId = crypto.randomUUID();
  const t0 = Date.now();
  if (sid)
    pushLog(sid, {
      agent,
      phase: "start",
      message: `Calling ${MODEL}`,
      corrId,
      model: MODEL,
      meta: { temperature, maxTokens, prompt: userMessage.slice(0, 220) },
    });

  const res = await fetchWithRetry(`${NIM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "/no_think " + systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
      chat_template_kwargs: { thinking: false },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    if (sid)
      pushLog(sid, {
        agent,
        phase: "error",
        message: `API error ${res.status}${res.status === 429 ? " (rate limited — retries exhausted)" : ""}`,
        corrId,
        latencyMs: Date.now() - t0,
        model: MODEL,
        meta: { body: t.slice(0, 200) },
      });
    const msg = res.status === 429
      ? "NVIDIA API rate limit hit — too many simultaneous interviews. Please wait a moment and try again."
      : `NIM API error ${res.status}: ${t.slice(0, 300)}`;
    throw new Error(msg);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    console.error("NIM empty content:", JSON.stringify(data).slice(0, 500));
    if (sid)
      pushLog(sid, {
        agent,
        phase: "error",
        message: "Empty response from model",
        corrId,
        latencyMs: Date.now() - t0,
        model: MODEL,
      });
    throw new Error("AI model returned empty response");
  }
  const latencyMs = Date.now() - t0;
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const costUsd = estimateCostUsd(inputTokens, outputTokens);
  if (sid)
    pushLog(sid, {
      agent,
      phase: "end",
      message: `Done in ${latencyMs}ms`,
      corrId,
      latencyMs,
      inputTokens,
      outputTokens,
      costUsd,
      model: MODEL,
      meta: {
        // Keep the legacy `tokens` field so any pre-dashboard consumers (e.g.
        // the existing event-list UI) don't lose info during the migration.
        tokens: data.usage?.total_tokens,
        preview: content.slice(0, 200),
      },
    });
  return content;
}

export function parseJSON<T = unknown>(text: string | null | undefined): T {
  if (!text || typeof text !== "string") {
    throw new Error("Cannot parse JSON: empty response from AI");
  }
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Failed to parse JSON from: " + cleaned.slice(0, 200));
  }
}
