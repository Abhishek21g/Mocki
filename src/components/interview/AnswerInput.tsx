import { Mic, User, Volume2, VolumeX } from "lucide-react";
import { primeAudio, type TtsController, type TtsStatus } from "@/lib/tts";
import type { InterviewStage, TurnType } from "@/server/sessions.server";

export function AnswerInput({
  answer,
  setAnswer,
  controlsDisabled,
  speechSupported,
  isHoldingTalk,
  interimTranscript,
  ttsEnabled,
  setTtsEnabled,
  ttsStatus,
  ttsRef,
  startHoldToTalk,
  stopHoldToTalk,
  devMode,
  setDevMode,
}: {
  answer: string;
  setAnswer: (value: string) => void;
  controlsDisabled: boolean;
  speechSupported: boolean;
  isHoldingTalk: boolean;
  interimTranscript: string;
  ttsEnabled: boolean;
  setTtsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  ttsStatus: TtsStatus;
  ttsRef: React.RefObject<TtsController | null>;
  startHoldToTalk: () => void;
  stopHoldToTalk: () => void;
  devMode: boolean;
  setDevMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentStage?: InterviewStage;
  currentTurnType?: TurnType;
  currentFocus?: string;
  currentDifficulty?: string;
  primeAudioFn?: typeof primeAudio;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="mono text-[11px] uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        Your Answer
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTtsEnabled((prev) => {
                const next = !prev;
                if (next) primeAudio();
                else ttsRef.current?.stop();
                return next;
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
            style={{
              borderColor: ttsEnabled ? "rgba(118,185,0,0.5)" : "var(--border)",
              background: ttsEnabled ? "var(--green-dim)" : "var(--surface2)",
              color: ttsEnabled ? "var(--green)" : "var(--text-2)",
            }}
            title={ttsEnabled ? "Voice on — click to mute" : "Voice off — click to enable"}
            aria-pressed={ttsEnabled}
            disabled={false}
          >
            {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>
              Voice{" "}
              {ttsEnabled
                ? ttsStatus === "playing"
                  ? "speaking"
                  : ttsStatus === "loading"
                    ? "loading"
                    : "on"
                : "off"}
            </span>
          </button>
          <span
            title="Live interviewer avatar powered by NVIDIA Riva — coming soon"
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold select-none cursor-default"
            style={{
              borderColor: "var(--border)",
              borderStyle: "dashed",
              background: "transparent",
              color: "var(--text-3)",
            }}
          >
            <User size={14} />
            <span>Live Avatar</span>
            <span
              style={{
                fontSize: "0.7em",
                letterSpacing: "0.04em",
                background: "linear-gradient(90deg, var(--green), #4d7a00)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontWeight: 700,
              }}
            >
              COMING SOON
            </span>
          </span>
          <button
            type="button"
            onClick={() => setDevMode((d) => !d)}
            title={devMode ? "Switch to interview view" : "Switch to developer view"}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
            style={{
              borderColor: devMode ? "rgba(118,185,0,0.4)" : "var(--border)",
              background: devMode ? "var(--green-dim)" : "transparent",
              color: devMode ? "var(--green)" : "var(--text-3)",
            }}
          >
            {devMode ? "⚙ Dev" : "⚙ Dev"}
          </button>
        </div>
      </div>
      <div className="relative">
        <textarea
          className="gp-input"
          style={{
            minHeight: 200,
            resize: "vertical",
            lineHeight: 1.7,
            paddingBottom: 36,
            paddingRight: speechSupported ? 52 : 12,
          }}
          placeholder="Type your answer, or hold the mic to speak."
          value={answer}
          onChange={(e) => {
            if (!controlsDisabled) setAnswer(e.target.value);
          }}
          disabled={controlsDisabled}
        />
        {/* Char count + recording status */}
        <div
          className="mono pointer-events-none absolute bottom-2 left-3 text-xs"
          style={{ color: "var(--text-3)" }}
        >
          {answer.length} chars
          {isHoldingTalk && (
            <span style={{ color: "var(--green)", marginLeft: 6 }}>● recording</span>
          )}
        </div>
        {/* Mic button — always visible if supported */}
        {speechSupported && (
          <button
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border transition-all"
            style={{
              borderColor: isHoldingTalk ? "var(--green)" : "var(--border)",
              background: isHoldingTalk ? "var(--green-dim)" : "var(--surface2)",
              color: isHoldingTalk ? "var(--green)" : "var(--text-2)",
              boxShadow: isHoldingTalk ? "0 0 0 3px rgba(118,185,0,0.25)" : "none",
            }}
            onPointerDown={startHoldToTalk}
            onPointerUp={stopHoldToTalk}
            onPointerLeave={stopHoldToTalk}
            onPointerCancel={stopHoldToTalk}
            disabled={controlsDisabled}
            aria-label={isHoldingTalk ? "Release to stop recording" : "Hold mic to speak"}
            title={isHoldingTalk ? "Release to stop" : "Hold to speak"}
          >
            <Mic size={14} />
          </button>
        )}
      </div>
      {/* Interim transcript — shown as a pill below the textarea while recording */}
      {interimTranscript && (
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2 text-sm"
          style={{
            background: "var(--surface2)",
            border: "1px solid rgba(118,185,0,0.3)",
            color: "var(--text-2)",
            fontStyle: "italic",
          }}
        >
          <span style={{ color: "var(--green)", flexShrink: 0 }}>●</span>
          <span>{interimTranscript}</span>
        </div>
      )}
    </div>
  );
}
