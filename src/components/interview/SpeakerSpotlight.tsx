import type { AvatarStatus } from "@/lib/avatar";
import type { TtsStatus } from "@/lib/tts";
import type { Persona } from "@/server/sessions.server";
import { initials } from "@/lib/ghost-utils";
import { AvatarOrb } from "./AvatarOrb";

export function SpeakerSpotlight({
  interviewer,
  loadingNext,
  lastClarification,
  ttsStatus,
  avatarStatus,
  avatarEnabled,
  avatarVideoRef,
  onReplayRequest,
}: {
  interviewer: Persona;
  loadingNext: boolean;
  lastClarification: string | null;
  ttsStatus: TtsStatus;
  avatarStatus: AvatarStatus;
  avatarEnabled: boolean;
  avatarVideoRef: React.RefObject<HTMLVideoElement | null>;
  onReplayRequest?: () => void;
}) {
  const speaking = avatarEnabled ? avatarStatus === "playing" : ttsStatus === "playing";
  const loadingAudio = avatarEnabled ? avatarStatus === "loading" : ttsStatus === "loading";
  const indicatorActive = loadingNext || speaking || loadingAudio;

  const statusLabel = loadingNext
    ? "Planning next question…"
    : speaking
      ? "Speaking"
      : loadingAudio
        ? "Synthesizing voice…"
        : lastClarification
          ? "Clarifying"
          : "Listening";

  return (
    <div className="gp-card p-5 fade-up">
      {/* ── Avatar panel ─────────────────────────────────────────────────── */}
      <div
        className="relative mb-4 flex flex-col items-center justify-center overflow-hidden rounded-2xl"
        style={{
          background: "var(--surface3)",
          border: `2px solid ${speaking ? "var(--green)" : "var(--border)"}`,
          transition: "border-color 300ms ease",
          minHeight: 200,
          padding: "32px 20px 24px",
        }}
      >
        {/* Video avatar (SadTalker) — only when explicitly enabled */}
        {avatarEnabled ? (
          <>
            <video
              ref={avatarVideoRef as React.RefObject<HTMLVideoElement>}
              playsInline
              className="h-full w-full rounded-xl object-cover"
              style={{
                opacity: avatarStatus === "playing" ? 1 : 0,
                transition: "opacity 400ms ease",
                maxHeight: 240,
              }}
            />
            {avatarStatus !== "playing" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <AvatarOrb label={initials(interviewer.name)} ttsStatus={ttsStatus} size={120} />
              </div>
            )}
          </>
        ) : (
          /* Orb avatar — always on */
          <AvatarOrb
            label={initials(interviewer.name)}
            ttsStatus={ttsStatus}
            size={140}
            onClick={!speaking && !loadingAudio && !loadingNext ? onReplayRequest : undefined}
          />
        )}

        {/* Speaking waveform badge */}
        {speaking && (
          <div
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
          >
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-1 rounded-full"
                style={{
                  background: "var(--green)",
                  height: `${8 + (i % 2 === 0 ? 8 : 4)}px`,
                  animation: `bounce-dot 0.8s ease-in-out infinite ${i * 120}ms`,
                }}
              />
            ))}
            <span className="mono ml-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--green)" }}>
              Speaking
            </span>
          </div>
        )}

        {/* Tap to replay hint — shown when idle and replay is available */}
        {!speaking && !loadingAudio && !loadingNext && onReplayRequest && (
          <span
            className="mono absolute bottom-3 right-3 text-[10px] uppercase tracking-wider"
            style={{ color: "var(--text-3)" }}
          >
            tap to replay
          </span>
        )}
      </div>

      {/* ── Interviewer info ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-bold">{interviewer.name}</div>
          <div className="text-sm" style={{ color: "var(--text-2)" }}>
            {interviewer.title}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs mono" style={{ color: "var(--text-2)" }}>
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: indicatorActive ? "var(--green)" : "var(--text-3)",
              animation: indicatorActive ? "bounce-dot 1s infinite" : "none",
            }}
          />
          {statusLabel}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: "var(--green-dim)", color: "var(--green)" }}
        >
          {interviewer.personality}
        </span>
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: "var(--surface3)", color: "var(--text-2)" }}
        >
          {interviewer.focus}
        </span>
      </div>

      {ttsStatus === "error" && onReplayRequest && (
        <button
          type="button"
          onClick={onReplayRequest}
          className="mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: "rgba(118,185,0,0.12)", color: "var(--green)", border: "1px solid rgba(118,185,0,0.3)" }}
        >
          🔊 Tap to hear question
        </button>
      )}
    </div>
  );
}
