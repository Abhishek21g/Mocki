export type TtsStatus = "idle" | "loading" | "playing" | "error";

export type TtsController = {
  /**
   * Synthesize and play the given text in the given voice. Cancels any
   * in-flight request and stops any currently playing audio. Resolves once
   * playback ends or rejects if the request fails or is aborted.
   */
  speak(text: string, voice: string, sessionId?: string | null): Promise<void>;
  /** Pause and clear any playing audio. */
  stop(): void;
  /** Whether audio is currently playing or being fetched. */
  isBusy(): boolean;
  /** Tear down the audio element and abort any pending requests. */
  destroy(): void;
};

export type TtsControllerOptions = {
  /**
   * URL the controller POSTs `{text, voice, sessionId?}` to. The response is
   * expected to be `audio/wav` (or any audio MIME the browser can decode).
   */
  proxyUrl: string;
  onStatus?: (status: TtsStatus) => void;
  onError?: (message: string) => void;
};

/**
 * Pulls a short, human-readable failure reason out of an upstream TTS error
 * response. The Riva bridge returns FastAPI errors as `{detail: string}`,
 * where `detail` is often a verbose multi-line gRPC dump. We extract the
 * `details = "..."` portion when present (e.g.
 * `Model is not available on server: subvoice requested not found`).
 */
async function extractErrorMessage(res: Response): Promise<string> {
  const fallback = `TTS request failed (${res.status})`;
  const raw = await res.text().catch(() => "");
  if (!raw) return fallback;

  let detail = raw;
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    if (typeof parsed.detail === "string") detail = parsed.detail;
  } catch {
    // Not JSON; fall through with the raw body.
  }

  const grpcMatch = detail.match(/details\s*=\s*"([^"]+)"/);
  if (grpcMatch?.[1]) return grpcMatch[1];

  const condensed = detail.replace(/\s+/g, " ").trim();
  return condensed.slice(0, 200) || fallback;
}

/**
 * 4-sample silent PCM16 mono 8 kHz WAV. Plays in <1 ms but counts as a real
 * audio play to the browser, which is what we need for autoplay priming.
 * Generated via the Python helper in `tools/nvidia-asr-bridge/`; verified
 * valid by `<audio>` decoders in Chrome/Edge/Safari/Firefox.
 */
const SILENT_WAV_DATA_URL =
  "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQgAAAAAAAAAAAAAAA==";

/**
 * Browsers track autoplay permission **per element**. To make priming
 * actually work, the priming play() and the question playback must happen on
 * the SAME element. We keep one shared element here, lazily created on
 * first use, and reused by every controller. Priming this element inside a
 * click handler sticks the permission to it for the lifetime of the page.
 */
let sharedAudio: HTMLAudioElement | null = null;
let primed = false;

function getSharedAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

/**
 * Plays a tiny silent WAV synchronously inside a user gesture so that
 * later `audio.play()` calls (for the actual question audio) are not blocked
 * by Chrome/Safari autoplay policies. Safe to call repeatedly; only the first
 * call does real work. Must be called from a real user-input handler (click,
 * tap, keypress) to satisfy gesture-activation rules.
 */
export function primeAudio(): void {
  if (primed) return;
  const audio = getSharedAudio();
  if (!audio) return;
  primed = true;
  try {
    audio.src = SILENT_WAV_DATA_URL;
    // Volume just above zero — Chrome may treat exactly 0 as "muted" which
    // doesn't grant the same autoplay headroom for later unmuted plays.
    audio.volume = 0.001;
    audio.muted = false;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          // Pause but DO NOT clear src/load() — clearing would reset the
          // element to an "empty media" state in some browsers and revoke
          // the autoplay privilege we just earned. Playback will set its
          // own src later, which transitions cleanly from here.
          audio.pause();
          audio.volume = 1;
        })
        .catch(() => {
          // Priming failed (e.g. user dismissed the gesture). Next gesture
          // will give us another shot via the same code path.
          primed = false;
        });
    }
  } catch {
    primed = false;
  }
}

export function createTtsController(options: TtsControllerOptions): TtsController {
  // Reuse the shared element so any priming done via primeAudio() in a user
  // gesture transfers its autoplay permission to actual question playback.
  const audio = getSharedAudio();
  let abortController: AbortController | null = null;
  let activeUrl: string | null = null;
  let status: TtsStatus = "idle";
  let busy = false;

  const setStatus = (next: TtsStatus) => {
    status = next;
    options.onStatus?.(next);
  };

  const releaseUrl = () => {
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = null;
    }
  };

  const onEnded = () => {
    busy = false;
    releaseUrl();
    setStatus("idle");
  };
  const onError = () => {
    busy = false;
    releaseUrl();
    // Errors from the audio element itself (decoder failures, etc).
    setStatus("error");
    options.onError?.("Audio playback failed");
  };
  const onPlaying = () => {
    setStatus("playing");
  };

  if (audio) {
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("playing", onPlaying);
  }

  const cancelInFlight = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  const stopAudio = () => {
    if (!audio) return;
    // Just pause — DO NOT clear src/load(). Clearing the src on a primed
    // shared element can revoke its autoplay privilege in some browsers.
    // The next assignment to `audio.src` is a clean transition on its own.
    audio.pause();
    releaseUrl();
  };

  async function speak(text: string, voice: string, sessionId?: string | null): Promise<void> {
    if (!audio) return;
    const trimmed = text.trim();
    if (!trimmed || !voice) return;

    cancelInFlight();
    stopAudio();

    busy = true;
    setStatus("loading");

    const controller = new AbortController();
    abortController = controller;

    try {
      const res = await fetch(options.proxyUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "audio/wav" },
        body: JSON.stringify({
          text: trimmed,
          voice,
          ...(sessionId ? { sessionId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(await extractErrorMessage(res));
      }

      const blob = await res.blob();
      if (controller.signal.aborted) return;

      releaseUrl();
      const url = URL.createObjectURL(blob);
      activeUrl = url;
      audio.src = url;

      try {
        await audio.play();
        setStatus("playing");
      } catch (err) {
        busy = false;
        releaseUrl();
        setStatus("error");
        const msg =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Browser blocked auto-play. Tap the speaker area to replay."
            : "Could not start audio playback";
        options.onError?.(msg);
        // Reject so callers (e.g. interview auto-speak dedupe) can retry after a user gesture.
        throw new Error(msg);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      busy = false;
      setStatus("error");
      if (
        !(err instanceof Error) ||
        (err.message !== "Browser blocked auto-play. Tap the speaker area to replay." &&
          err.message !== "Could not start audio playback")
      ) {
        options.onError?.(err instanceof Error ? err.message : "TTS request failed");
      }
    } finally {
      if (abortController === controller) abortController = null;
    }
  }

  function stop() {
    cancelInFlight();
    stopAudio();
    busy = false;
    if (status !== "idle") setStatus("idle");
  }

  function destroy() {
    cancelInFlight();
    stopAudio();
    busy = false;
    if (audio) {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("playing", onPlaying);
    }
  }

  return {
    speak,
    stop,
    isBusy: () => busy,
    destroy,
  };
}
