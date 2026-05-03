/**
 * Avatar video controller — lip-synced talking-head playback.
 *
 * Fetches a video/mp4 from /api/tts-avatar (which runs the TTS + SadTalker /
 * Audio2Face-2D pipeline on the bridge server) and plays it through a <video>
 * element. Because the MP4 carries the audio track, we skip the normal TTS
 * controller entirely when avatar mode is active.
 *
 * Usage in interview.tsx:
 *   const avatar = useRef(createAvatarController({ ... }));
 *   ...
 *   await avatar.current.speak(text, voice, interviewerId, sessionId);
 */

export type AvatarStatus = "idle" | "loading" | "playing" | "error";

export type AvatarController = {
  /** Fetch + play the avatar video. Cancels any in-flight request. */
  speak(
    text: string,
    voice: string,
    avatarId: string,
    sessionId?: string | null,
  ): Promise<void>;
  /** Stop playback and cancel any pending fetch. */
  stop(): void;
  /** Whether a request is in-flight or the video is playing. */
  isBusy(): boolean;
  /** Current status — use to drive UI state. */
  getStatus(): AvatarStatus;
  /** Tear down the video element and abort any pending requests. */
  destroy(): void;
};

export type AvatarControllerOptions = {
  /** URL this controller POSTs `{text, voice, avatarId}` to. */
  proxyUrl: string;
  /** The <video> DOM element to play into. */
  videoEl: HTMLVideoElement;
  onStatus?: (status: AvatarStatus) => void;
  onError?: (message: string) => void;
};

export function createAvatarController(options: AvatarControllerOptions): AvatarController {
  const { videoEl, proxyUrl } = options;
  let abortController: AbortController | null = null;
  let activeObjectUrl: string | null = null;
  let status: AvatarStatus = "idle";
  let busy = false;

  const setStatus = (next: AvatarStatus) => {
    status = next;
    options.onStatus?.(next);
  };

  const releaseUrl = () => {
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
  };

  const cancelInFlight = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  const stopVideo = () => {
    videoEl.pause();
    releaseUrl();
    videoEl.removeAttribute("src");
    videoEl.load();
  };

  const onEnded = () => {
    busy = false;
    releaseUrl();
    setStatus("idle");
  };
  const onPlaying = () => setStatus("playing");
  const onError = () => {
    busy = false;
    releaseUrl();
    setStatus("error");
    options.onError?.("Avatar video playback failed");
  };

  videoEl.addEventListener("ended", onEnded);
  videoEl.addEventListener("playing", onPlaying);
  videoEl.addEventListener("error", onError);

  async function speak(
    text: string,
    voice: string,
    avatarId: string,
    sessionId?: string | null,
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !voice) return;

    cancelInFlight();
    stopVideo();

    busy = true;
    setStatus("loading");

    const controller = new AbortController();
    abortController = controller;

    try {
      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          voice,
          avatarId,
          ...(sessionId ? { sessionId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        let detail = errBody;
        try {
          const parsed = JSON.parse(errBody) as { detail?: string; error?: string };
          detail = parsed.detail ?? parsed.error ?? errBody;
        } catch {
          // keep raw body
        }
        throw new Error(`Avatar request failed (${res.status}): ${detail.slice(0, 200)}`);
      }

      const blob = await res.blob();
      if (controller.signal.aborted) return;

      releaseUrl();
      const url = URL.createObjectURL(blob);
      activeObjectUrl = url;

      videoEl.src = url;
      videoEl.load();

      try {
        await videoEl.play();
        setStatus("playing");
      } catch (err) {
        busy = false;
        releaseUrl();
        setStatus("error");
        const msg =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Browser blocked avatar auto-play. Click to replay."
            : "Could not start avatar video playback";
        options.onError?.(msg);
        throw new Error(msg);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      busy = false;
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Avatar request failed";
      if (
        !msg.includes("Browser blocked avatar auto-play") &&
        !msg.includes("Could not start avatar video")
      ) {
        options.onError?.(msg);
      }
    } finally {
      if (abortController === controller) abortController = null;
    }
  }

  function stop() {
    cancelInFlight();
    stopVideo();
    busy = false;
    if (status !== "idle") setStatus("idle");
  }

  function destroy() {
    cancelInFlight();
    stopVideo();
    busy = false;
    videoEl.removeEventListener("ended", onEnded);
    videoEl.removeEventListener("playing", onPlaying);
    videoEl.removeEventListener("error", onError);
  }

  return {
    speak,
    stop,
    isBusy: () => busy,
    getStatus: () => status,
    destroy,
  };
}
