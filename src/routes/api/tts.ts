import { createFileRoute } from "@tanstack/react-router";
import { pushLog } from "@/server/agent-log.server";

const DEFAULT_NVIDIA_TTS_HTTP_URL = "http://127.0.0.1:8788/synthesize";

type TtsRequestBody = {
  text?: unknown;
  voice?: unknown;
  language?: unknown;
  sampleRateHz?: unknown;
  sample_rate_hz?: unknown;
  sessionId?: unknown;
};

function jsonError(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { Allow: "OPTIONS,POST" },
        }),

      POST: async ({ request }) => {
        let body: TtsRequestBody;
        try {
          body = (await request.json()) as TtsRequestBody;
        } catch {
          return jsonError({ error: "Invalid JSON body" }, 400);
        }

        const text = typeof body.text === "string" ? body.text.trim() : "";
        const voice = typeof body.voice === "string" ? body.voice.trim() : "";
        if (!text) return jsonError({ error: "Missing 'text'" }, 400);
        if (!voice) return jsonError({ error: "Missing 'voice'" }, 400);
        if (text.length > 4000) {
          return jsonError({ error: "text exceeds 4000 character limit" }, 400);
        }

        const language =
          (typeof body.language === "string" && body.language.trim()) ||
          (process.env.NVIDIA_TTS_LANGUAGE as string | undefined)?.trim() ||
          "en-US";

        const sampleRateRaw =
          (typeof body.sampleRateHz === "number" && body.sampleRateHz) ||
          (typeof body.sample_rate_hz === "number" && body.sample_rate_hz) ||
          Number((process.env.NVIDIA_TTS_SAMPLE_RATE_HZ as string | undefined)?.trim() || "22050");
        const sampleRateHz = Number.isFinite(sampleRateRaw) && sampleRateRaw > 0 ? sampleRateRaw : 22050;

        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

        const upstreamUrl =
          (process.env.NVIDIA_TTS_HTTP_URL as string | undefined)?.trim() ||
          DEFAULT_NVIDIA_TTS_HTTP_URL;
        const apiKey =
          (process.env.NVIDIA_TTS_API_KEY as string | undefined)?.trim() ||
          (process.env.NVIDIA_API_KEY as string | undefined)?.trim();
        const functionId = (process.env.NVIDIA_TTS_FUNCTION_ID as string | undefined)?.trim();

        if (sessionId) {
          pushLog(sessionId, {
            agent: "Speaker",
            phase: "start",
            message: `Synthesizing question with ${voice}`,
            meta: { voice, language, sampleRateHz, chars: text.length },
          });
        }

        const headers = new Headers({
          "content-type": "application/json",
          accept: "audio/wav",
        });
        if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
        if (functionId) headers.set("function-id", functionId);

        let upstreamRes: Response;
        try {
          upstreamRes = await fetch(upstreamUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              text,
              voice,
              language,
              sample_rate_hz: sampleRateHz,
            }),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upstream TTS request failed";
          if (sessionId) {
            pushLog(sessionId, {
              agent: "Speaker",
              phase: "error",
              message: "TTS upstream unreachable",
              meta: { error: message },
            });
          }
          return jsonError({ error: message }, 502);
        }

        if (!upstreamRes.ok || !upstreamRes.body) {
          const detail = await upstreamRes.text().catch(() => "");
          if (sessionId) {
            pushLog(sessionId, {
              agent: "Speaker",
              phase: "error",
              message: `TTS upstream error ${upstreamRes.status}`,
              meta: { detail: detail.slice(0, 200) },
            });
          }
          return jsonError(
            {
              error: "NVIDIA TTS request failed",
              status: upstreamRes.status,
              detail: detail.slice(0, 500),
            },
            502,
          );
        }

        if (sessionId) {
          pushLog(sessionId, {
            agent: "Speaker",
            phase: "end",
            message: `Streaming ${voice} audio to client`,
          });
        }

        return new Response(upstreamRes.body, {
          status: 200,
          headers: {
            "content-type": "audio/wav",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
