import { pushLog, currentSessionId } from "./agent-log.server";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "nvidia/nvidia-nemotron-nano-9b-v2";

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
  const t0 = Date.now();
  if (sid)
    pushLog(sid, {
      agent,
      phase: "start",
      message: `Calling ${MODEL}`,
      meta: { temperature, maxTokens, prompt: userMessage.slice(0, 220) },
    });

  const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
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
        message: `API error ${res.status}`,
        meta: { body: t.slice(0, 200) },
      });
    throw new Error(`NIM API error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: Record<string, number>;
  };
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    console.error("NIM empty content:", JSON.stringify(data).slice(0, 500));
    if (sid) pushLog(sid, { agent, phase: "error", message: "Empty response from model" });
    throw new Error("AI model returned empty response");
  }
  if (sid)
    pushLog(sid, {
      agent,
      phase: "end",
      message: `Done in ${Date.now() - t0}ms`,
      meta: { tokens: data.usage?.total_tokens, preview: content.slice(0, 200) },
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
