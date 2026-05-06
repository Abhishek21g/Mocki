import { cn } from "@/lib/utils";
import { initials } from "@/lib/ghost-utils";
import type { AvatarStatus } from "@/lib/avatar";
import type { TtsStatus } from "@/lib/tts";
import type { Persona } from "@/server/sessions.server";

export function SpeakerSpotlight({
  interviewer,
  loadingNext,
  lastClarification,
  ttsStatus,
  avatarStatus,
  avatarEnabled,
  avatarVideoRef,
}: {
  interviewer: Persona;
  loadingNext: boolean;
  lastClarification: string | null;
  ttsStatus: TtsStatus;
  avatarStatus: AvatarStatus;
  avatarEnabled: boolean;
  avatarVideoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const speaking = avatarEnabled ? avatarStatus === "playing" : ttsStatus === "playing";
  const loadingAudio = avatarEnabled ? avatarStatus === "loading" : ttsStatus === "loading";
  const indicatorActive = loadingNext || speaking || loadingAudio;

  const statusLabel = loadingNext
    ? "Planning the next conversational move"
    : avatarEnabled && avatarStatus === "loading"
      ? "Generating face — synthesizing voice & lip-sync…"
      : speaking
        ? "Speaking the question"
        : loadingAudio
          ? "Synthesizing voice"
          : lastClarification
            ? "Continuing the same answer with clarification"
            : "Listening for your answer";

  return (
    <div className="gp-card p-5 fade-up">
      {/* ── Live avatar video panel ──────────────────────────────────────── */}
      {avatarEnabled && (
        <div
          className="relative mb-5 overflow-hidden rounded-2xl"
          style={{
            background: "var(--surface3)",
            border: speaking ? "2px solid var(--green)" : "2px solid var(--border)",
            transition: "border-color 300ms ease",
            aspectRatio: "4/5",
            maxHeight: 340,
          }}
        >
          {/* The <video> element is always mounted when avatarEnabled so the
              controller ref is valid. It's hidden with opacity while loading. */}
          <video
            ref={avatarVideoRef as React.RefObject<HTMLVideoElement>}
            playsInline
            className="h-full w-full object-cover"
            style={{
              opacity: avatarStatus === "playing" ? 1 : 0,
              transition: "opacity 400ms ease",
            }}
          />

          {/* Poster / idle state — shown when video isn't playing */}
          {avatarStatus !== "playing" && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ background: "var(--surface2)" }}
            >
              {avatarStatus === "loading" ? (
                <>
                  {/* Animated portrait placeholder while generating */}
                  <div
                    className={cn(
                      "flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold",
                      "pulse-ring",
                    )}
                    style={{ background: "linear-gradient(135deg, var(--green), #4d7a00)", color: "#000" }}
                  >
                    {initials(interviewer.name)}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="gp-spinner" />
                    <span
                      className="mono text-[11px] uppercase tracking-wider"
                      style={{ color: "var(--text-3)" }}
                    >
                      Generating face…
                    </span>
                  </div>
                </>
              ) : (
                /* Idle — show a static portrait placeholder */
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold"
                  style={{ background: "linear-gradient(135deg, var(--green), #4d7a00)", color: "#000" }}
                >
                  {initials(interviewer.name)}
                </div>
              )}
            </div>
          )}

          {/* Speaking indicator overlay */}
          {speaking && (
            <div
              className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1"
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
                Live
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Interviewer info ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        {!avatarEnabled && (
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-black",
              speaking || loadingAudio ? "pulse-ring" : "",
            )}
            style={{ background: "linear-gradient(135deg, var(--green), #4d7a00)" }}
          >
            {initials(interviewer.name)}
          </div>
        )}
        <div className="flex-1">
          <div className="text-base font-bold">{interviewer.name}</div>
          <div className="text-sm" style={{ color: "var(--text-2)" }}>
            {interviewer.title}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
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
      <div className="mt-4 flex items-center gap-2 text-xs mono" style={{ color: "var(--text-2)" }}>
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
  );
}
