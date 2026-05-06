import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_NVIDIA_ASR_HTTP_URL = "http://localhost:9000/v1/audio/transcriptions";
const DEFAULT_NEMOTRON_FUNCTION_ID = "bb0837de-8c7b-481f-9ec8-ef5663e9c1fa";

type UpstreamPayload = {
  text?: unknown;
  transcript?: unknown;
  predictions?: unknown;
  result?: unknown;
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function toText(payload: UpstreamPayload): string {
  if (typeof payload.text === "string" && payload.text.trim()) return payload.text.trim();
  if (typeof payload.transcript === "string" && payload.transcript.trim()) return payload.transcript.trim();
  if (typeof payload.result === "string" && payload.result.trim()) return payload.result.trim();

  if (Array.isArray(payload.predictions)) {
    const first = payload.predictions[0] as Record<string, unknown> | undefined;
    const candidate = first?.text ?? first?.transcript;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return "";
}

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            Allow: "OPTIONS,POST",
          },
        }),

      POST: async ({ request }) => {
        try {
          const formData = await request.formData();
          const audio =
            (formData.get("audio") as File | null) ?? (formData.get("file") as File | null);

          if (!audio) {
            return json({ error: "Missing audio file in form-data (expected 'audio' or 'file')." }, { status: 400 });
          }

          // OpenAI Whisper fallback — used when NVIDIA ASR is not configured
          const openaiKey = (process.env.OPENAI_API_KEY as string | undefined)?.trim();
          const nvidiaConfigured = Boolean(
            (process.env.NVIDIA_ASR_HTTP_URL as string | undefined)?.trim() ||
            (process.env.NVIDIA_ASR_API_KEY as string | undefined)?.trim() ||
            (process.env.NVIDIA_API_KEY as string | undefined)?.trim(),
          );

          if (!nvidiaConfigured && openaiKey) {
            const whisperForm = new FormData();
            whisperForm.append("file", audio, audio.name || "audio.wav");
            whisperForm.append("model", "whisper-1");
            whisperForm.append("language", "en");

            const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
              method: "POST",
              headers: { authorization: `Bearer ${openaiKey}` },
              body: whisperForm,
            });

            const whisperData = (await whisperRes.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
            if (!whisperRes.ok) {
              return json({ error: whisperData.error?.message ?? "Whisper transcription failed" }, { status: 502 });
            }
            const text = typeof whisperData.text === "string" ? whisperData.text.trim() : "";
            if (!text) return json({ error: "Whisper returned empty transcript" }, { status: 502 });
            return json({ text, provider: "openai" });
          }

          if (!nvidiaConfigured && !openaiKey) {
            return json({ error: "No STT backend configured. Set OPENAI_API_KEY or NVIDIA_ASR_API_KEY." }, { status: 503 });
          }

          const nvidiaAsrHttpUrl =
            (process.env.NVIDIA_ASR_HTTP_URL as string | undefined)?.trim() ||
            DEFAULT_NVIDIA_ASR_HTTP_URL;
          const nvidiaApiKey =
            (process.env.NVIDIA_ASR_API_KEY as string | undefined)?.trim() ||
            (process.env.NVIDIA_API_KEY as string | undefined)?.trim();
          const nvidiaFunctionId =
            (process.env.NVIDIA_ASR_FUNCTION_ID as string | undefined)?.trim() ||
            DEFAULT_NEMOTRON_FUNCTION_ID;
          const language = (process.env.NVIDIA_ASR_LANGUAGE as string | undefined)?.trim() || "en-US";
          const automaticPunctuation =
            ((process.env.NVIDIA_ASR_AUTOMATIC_PUNCTUATION as string | undefined)?.trim() || "true")
              .toLowerCase()
              .trim() !== "false";

          const upstreamBody = new FormData();
          upstreamBody.append("file", audio, audio.name || "speech.webm");
          upstreamBody.append("language", language);
          upstreamBody.append("automatic-punctuation", String(automaticPunctuation));

          const headers = new Headers();
          if (nvidiaApiKey) headers.set("authorization", `Bearer ${nvidiaApiKey}`);
          if (nvidiaFunctionId) headers.set("function-id", nvidiaFunctionId);

          const upstreamRes = await fetch(nvidiaAsrHttpUrl, {
            method: "POST",
            headers,
            body: upstreamBody,
          });

          const raw = await upstreamRes.text();
          if (!upstreamRes.ok) {
            return json(
              {
                error: "NVIDIA ASR request failed",
                status: upstreamRes.status,
                detail: raw.slice(0, 500),
              },
              { status: 502 },
            );
          }

          let payload: UpstreamPayload = {};
          try {
            payload = JSON.parse(raw) as UpstreamPayload;
          } catch {
            // Some ASR bridges may return plain text.
            payload = { text: raw };
          }

          const text = toText(payload);
          if (!text) {
            return json(
              {
                error: "Upstream ASR returned no transcript text",
                raw: payload,
              },
              { status: 502 },
            );
          }

          return json({
            text,
            provider: "nvidia",
            language,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown STT server error";
          return json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
