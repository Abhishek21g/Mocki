import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_AVATAR_HTTP_URL = "http://127.0.0.1:8788/tts-avatar";

type AvatarRequestBody = {
  text?: unknown;
  voice?: unknown;
  avatarId?: unknown;
  avatar_id?: unknown;
  language?: unknown;
  sampleRateHz?: unknown;
  sample_rate_hz?: unknown;
  sessionId?: unknown;
  session_id?: unknown;
};

function jsonError(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/tts-avatar")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { Allow: "OPTIONS,POST" },
        }),

      POST: async ({ request }) => {
        const { pushLog } = await import("@/server/agent-log.server");
        let body: AvatarRequestBody;
        try {
          body = (await request.json()) as AvatarRequestBody;
        } catch {
          return jsonError({ error: "Invalid JSON body" }, 400);
        }

        const text = typeof body.text === "string" ? body.text.trim() : "";
        const voice = typeof body.voice === "string" ? body.voice.trim() : "";
        const avatarId =
          (typeof body.avatarId === "string" ? body.avatarId.trim() : "") ||
          (typeof body.avatar_id === "string" ? body.avatar_id.trim() : "") ||
          "practitioner";

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
        const sampleRateHz =
          Number.isFinite(sampleRateRaw) && sampleRateRaw > 0 ? sampleRateRaw : 22050;

        const sessionId =
          typeof body.sessionId === "string"
            ? body.sessionId
            : typeof body.session_id === "string"
              ? body.session_id
              : "";

        const upstreamUrl =
          (process.env.NVIDIA_AVATAR_HTTP_URL as string | undefined)?.trim() ||
          DEFAULT_AVATAR_HTTP_URL;

        if (sessionId) {
          pushLog(sessionId, {
            agent: "Avatar",
            phase: "start",
            message: `Generating lip-sync video for ${avatarId} (${voice})`,
            meta: { avatarId, voice, language, chars: text.length },
          });
        }

        let upstreamRes: Response;
        try {
          upstreamRes = await fetch(upstreamUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text,
              voice,
              avatar_id: avatarId,
              language,
              sample_rate_hz: sampleRateHz,
              session_id: sessionId,
            }),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Avatar upstream request failed";
          if (sessionId) {
            pushLog(sessionId, {
              agent: "Avatar",
              phase: "error",
              message: "Avatar upstream unreachable",
              meta: { error: message },
            });
          }
          return jsonError({ error: message }, 502);
        }

        if (!upstreamRes.ok || !upstreamRes.body) {
          const detail = await upstreamRes.text().catch(() => "");
          if (sessionId) {
            pushLog(sessionId, {
              agent: "Avatar",
              phase: "error",
              message: `Avatar upstream error ${upstreamRes.status}`,
              meta: { detail: detail.slice(0, 200) },
            });
          }
          return jsonError(
            {
              error: "Avatar generation failed",
              status: upstreamRes.status,
              detail: detail.slice(0, 500),
            },
            502,
          );
        }

        if (sessionId) {
          pushLog(sessionId, {
            agent: "Avatar",
            phase: "end",
            message: `Streaming lip-sync video for ${avatarId}`,
          });
        }

        return new Response(upstreamRes.body, {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
