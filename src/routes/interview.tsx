import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, User, Volume2, VolumeX } from "lucide-react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { showToast } from "@/components/ghost/Toaster";
import { useIsMobile } from "@/hooks/use-mobile";
import { store, useAppState } from "@/lib/ghost-store";
import {
  capitalize,
  difficultyColor,
  humanizeLabel,
  initials,
  scoreToColor,
  stageLabel,
} from "@/lib/ghost-utils";
import {
  createSpeechRecognitionController,
  isAudioCaptureSupported,
  isSpeechRecognitionSupported,
  type SpeechEngine,
  type SpeechRecognitionStatus,
} from "@/lib/speech";
import { createAvatarController, type AvatarController, type AvatarStatus } from "@/lib/avatar";
import { createTtsController, primeAudio, type TtsController, type TtsStatus } from "@/lib/tts";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { fetchAgentLogs, generateReport, submitAnswer } from "@/server/interview.functions";
import type { InterviewStage, Persona, RoleProfile, TurnType } from "@/server/sessions.server";
import { AgentDashboard } from "@/components/agent-dashboard";
import type { AgentEvent } from "@/components/agent-dashboard/types";

const TTS_ENABLED_STORAGE_KEY = "mocki:ttsEnabled";
const AVATAR_ENABLED_STORAGE_KEY = "mocki:avatarEnabled";

export const Route = createFileRoute("/interview")({
  head: () => ({
    meta: [{ title: "Interview · Mocki" }],
  }),
  component: InterviewPage,
});

function InterviewPage() {
  const state = useAppState();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const { getAccessToken } = useSupabaseAuth();
  const [answer, setAnswer] = useState("");
  const [inputMode, setInputMode] = useState<"typing" | "hold_to_talk">("typing");
  const [speechStatus, setSpeechStatus] = useState<SpeechRecognitionStatus>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isHoldingTalk, setIsHoldingTalk] = useState(false);
  const [sttEngine, setSttEngine] = useState<SpeechEngine | null>(null);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [canInlineAgents, setCanInlineAgents] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognitionController> | null>(null);
  const ttsRef = useRef<TtsController | null>(null);
  const avatarRef = useRef<AvatarController | null>(null);
  const avatarVideoElRef = useRef<HTMLVideoElement | null>(null);
  const sinceRef = useRef(0);
  const sttProxyUrl = (import.meta.env.VITE_STT_PROXY_URL as string | undefined)?.trim();
  const ttsProxyUrl =
    (import.meta.env.VITE_TTS_PROXY_URL as string | undefined)?.trim() || "/api/tts";
  const avatarProxyUrl =
    (import.meta.env.VITE_AVATAR_PROXY_URL as string | undefined)?.trim() || "/api/tts-avatar";
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(TTS_ENABLED_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>("idle");
  /** Dedupes automatic playback only **after** a question audibly succeeds; avoids locking out retries on transient TTS/play failures (first prompt often hit this). */
  const lastSuccessfullySpokenKeyRef = useRef<string | null>(null);

  const [avatarEnabled, setAvatarEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem(AVATAR_ENABLED_STORAGE_KEY);
    // Default off — only turns on once user explicitly enables it (requires the bridge).
    return stored === "true";
  });
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>("idle");
  const lastAvatarKeyRef = useRef<string | null>(null);
  const controlsDisabled = loadingAnswer || loadingNext || generating;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const sync = () => setCanInlineAgents(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const recognition = createSpeechRecognitionController({
      proxyUrl: sttProxyUrl,
      onStatus: setSpeechStatus,
      onPartial: setInterimTranscript,
      onFinal: (text) =>
        setAnswer((prev) => {
          const prefix = prev.trim();
          return prefix ? `${prefix} ${text}` : text;
        }),
      onError: (message) => {
        showToast(message);
        setIsHoldingTalk(false);
      },
    });
    recognitionRef.current = recognition;
    setSpeechSupported(recognition.supported);
    setSttEngine(recognition.engine);
    if (!recognition.supported) setInputMode("typing");

    return () => {
      recognition.destroy();
      recognitionRef.current = null;
    };
  }, [sttProxyUrl]);

  useEffect(() => {
    const tts = createTtsController({
      proxyUrl: ttsProxyUrl,
      onStatus: setTtsStatus,
      onError: (message) => showToast(message),
    });
    ttsRef.current = tts;
    return () => {
      tts.destroy();
      ttsRef.current = null;
    };
  }, [ttsProxyUrl]);

  // Avatar controller — wired to the <video> element rendered in SpeakerSpotlight.
  // Re-created whenever the video element or proxy URL changes.
  useEffect(() => {
    const videoEl = avatarVideoElRef.current;
    if (!videoEl) return;
    const controller = createAvatarController({
      proxyUrl: avatarProxyUrl,
      videoEl,
      onStatus: setAvatarStatus,
      onError: (message) => showToast(`Avatar: ${message}`),
    });
    avatarRef.current = controller;
    return () => {
      controller.destroy();
      avatarRef.current = null;
    };
  // Re-run whenever the video element mounts (avatarEnabled toggles it in/out of DOM)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarProxyUrl, avatarEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TTS_ENABLED_STORAGE_KEY, String(ttsEnabled));
  }, [ttsEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AVATAR_ENABLED_STORAGE_KEY, String(avatarEnabled));
  }, [avatarEnabled]);

  const currentQuestion = state.currentQuestion;
  const activeInterviewerId = state.activeInterviewer?.id;
  const activeVoice = state.activeInterviewer?.voice;
  const sessionId = state.sessionId;
  const speakingBlocked = loadingAnswer || loadingNext || generating || isHoldingTalk;

  useEffect(() => {
    if (!ttsEnabled || avatarEnabled) {
      ttsRef.current?.stop();
      // Keep lastSuccessfullySpokenKeyRef populated so re-enabling doesn't replay the
      // current question; voice-on means "start hearing future questions".
      return;
    }
    if (!currentQuestion || !activeInterviewerId || !activeVoice) return;
    if (speakingBlocked) return;

    const key = `${activeInterviewerId}::${currentQuestion}`;
    if (lastSuccessfullySpokenKeyRef.current === key) return;

    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    const run = async () => {
      const tts = ttsRef.current;
      if (!tts) return;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (cancelled) return;
        try {
          await tts.speak(currentQuestion, activeVoice, sessionId);
          if (!cancelled) lastSuccessfullySpokenKeyRef.current = key;
          return;
        } catch (e) {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : String(e);
          // Playback permission / decoder start — retrying loop won't help until user interacts.
          if (
            msg.includes("Browser blocked auto-play") ||
            msg.includes("Could not start audio playback")
          )
            return;
          if (attempt >= 1) return;
          await sleep(550);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    ttsEnabled,
    avatarEnabled,
    currentQuestion,
    activeInterviewerId,
    activeVoice,
    sessionId,
    speakingBlocked,
  ]);

  // Avatar auto-speak: when avatarEnabled, fetch+play the lip-synced video
  // and suppress the plain TTS so audio doesn't play twice.
  useEffect(() => {
    if (!avatarEnabled) {
      avatarRef.current?.stop();
      return;
    }
    if (!currentQuestion || !activeInterviewerId || !activeVoice) return;
    if (speakingBlocked) return;

    const key = `${activeInterviewerId}::${currentQuestion}`;
    if (lastAvatarKeyRef.current === key) return;

    // Stop TTS so both audio sources don't race.
    ttsRef.current?.stop();

    let cancelled = false;
    const run = async () => {
      const ctrl = avatarRef.current;
      if (!ctrl) return;
      try {
        await ctrl.speak(currentQuestion, activeVoice, activeInterviewerId, sessionId);
        if (!cancelled) lastAvatarKeyRef.current = key;
      } catch {
        // Avatar controller already calls onError; silent here.
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    avatarEnabled,
    currentQuestion,
    activeInterviewerId,
    activeVoice,
    sessionId,
    speakingBlocked,
  ]);

  useEffect(() => {
    if (!state.sessionId) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetchAgentLogs({
          data: { sessionId: state.sessionId!, since: sinceRef.current },
        });
        if (!alive) return;
        if (res.events.length) {
          sinceRef.current = res.events[res.events.length - 1].ts;
          setEvents((prev) => [...prev, ...(res.events as AgentEvent[])].slice(-250));
        }
      } catch {
        // Ignore transient polling issues in the live trace.
      }
    };
    const id = setInterval(tick, 800);
    tick();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [state.sessionId]);

  useEffect(() => {
    if (inputMode === "typing") {
      setInterimTranscript("");
      setIsHoldingTalk(false);
      recognitionRef.current?.stop();
    }
  }, [inputMode]);

  if (!state.sessionId || !state.setupData || !state.activeInterviewer || !state.roleProfile) {
    return <Navigate to="/" />;
  }

  const setup = state.setupData;
  const activeInterviewer = state.activeInterviewer;
  const roleProfile = state.roleProfile;
  const showInlineAgents = showAgents && canInlineAgents;
  const showDrawerAgents = showAgents && !canInlineAgents;

  async function handleSubmit() {
    if (!answer.trim() || controlsDisabled) return;
    ttsRef.current?.stop();
    avatarRef.current?.stop();
    setLoadingAnswer(true);
    try {
      const res = await submitAnswer({
        data: { sessionId: state.sessionId!, answer },
      });

      if (res.clarification) {
        store.set({
          currentQuestion: res.follow_up!,
          currentTurnType: "clarification",
          lastClarification: res.follow_up!,
        });
        setAnswer("");
        setInterimTranscript("");
        setLoadingAnswer(false);
        return;
      }

      const currentRounds = store.get().rounds;
      store.set({
        lastEvaluation: res.evaluation,
        lastClarification: null,
        rounds: [...currentRounds, res.completedRound],
      });

      if (res.done) {
        setLoadingAnswer(false);
        setGenerating(true);
        try {
          const accessToken = getAccessToken();
          const report = await generateReport({
            data: {
              sessionId: state.sessionId!,
              ...(accessToken ? { accessToken } : {}),
            },
          });
          store.set({ report });
          nav({ to: "/report" });
        } catch (e) {
          showToast(e instanceof Error ? e.message : "Failed to generate report");
          setGenerating(false);
        }
        return;
      }

      setLoadingAnswer(false);
      setLoadingNext(true);
      setTimeout(() => {
        store.set({
          activeInterviewer: res.nextInterviewer!,
          currentQuestion: res.next_question!,
          currentFocus: res.focus!,
          currentDifficulty: res.difficulty!,
          currentCoordinatorReason: res.coordinatorReason!,
          currentStage: res.stage!,
          currentTurnType: res.turnType!,
          currentRound: res.round!,
        });
        setAnswer("");
        setInterimTranscript("");
        setLoadingNext(false);
      }, 1600);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to submit answer");
      setLoadingAnswer(false);
    }
  }

  function startHoldToTalk() {
    if (controlsDisabled) return;
    if (!speechSupported) {
      showToast("Voice input is not supported in this browser.");
      setInputMode("typing");
      return;
    }
    ttsRef.current?.stop();
    avatarRef.current?.stop();
    setIsHoldingTalk(true);
    recognitionRef.current?.start();
  }

  function stopHoldToTalk() {
    setIsHoldingTalk(false);
    recognitionRef.current?.stop();
  }

  return (
    <div className="min-h-screen">
      <TopBar
        role={setup.role}
        company={setup.company}
        round={state.currentRound}
        total={state.totalRounds}
      />

      <main className="mx-auto max-w-[1600px] px-5 pb-16 pt-24 md:px-8">
        <SessionStrip
          activeInterviewer={activeInterviewer}
          stage={state.currentStage}
          turnType={state.currentTurnType}
          focus={state.currentFocus}
          round={state.currentRound}
          totalRounds={state.totalRounds}
          showAgents={showAgents}
          canInlineAgents={canInlineAgents}
          onToggleAgents={() => setShowAgents((value) => !value)}
        />

        <div
          className={cn(
            "mt-6 grid gap-6",
            showInlineAgents
              ? "xl:grid-cols-[320px_minmax(0,1fr)_360px]"
              : "xl:grid-cols-[320px_minmax(0,1fr)]",
          )}
        >
          <section className="flex flex-col gap-4">
            <div className="gp-card p-5">
              <div className="mono text-[11px] uppercase tracking-wider text-[color:var(--text-3)]">
                Interview Panel
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {state.interviewers.map((interviewer) => (
                  <PanelCard
                    key={interviewer.id}
                    interviewer={interviewer}
                    active={interviewer.id === activeInterviewer.id}
                  />
                ))}
              </div>
            </div>

            <FlowCard
              stage={state.currentStage}
              turnType={state.currentTurnType}
              focus={state.currentFocus}
              reason={state.currentCoordinatorReason}
            />
          </section>

          <section className="flex flex-col gap-5">
            <SpeakerSpotlight
              interviewer={activeInterviewer}
              loadingNext={loadingNext}
              lastClarification={state.lastClarification}
              ttsStatus={ttsStatus}
              avatarStatus={avatarStatus}
              avatarEnabled={avatarEnabled}
              avatarVideoRef={avatarVideoElRef}
            />

            <div className="flex flex-col gap-3">
              <div
                className="mono flex items-center gap-2 text-[11px] uppercase tracking-wider"
                style={{ color: state.lastClarification ? "var(--yellow)" : "var(--text-3)" }}
              >
                {state.lastClarification ? "↳ Clarification" : "Current Turn"}
              </div>
              {loadingNext ? (
                <TypingIndicator />
              ) : (
                <div
                  key={state.currentQuestion}
                  className="fade-up rounded-[0_12px_12px_12px] p-5 text-[15px] leading-relaxed md:text-base"
                  style={{
                    background: "var(--surface2)",
                    borderLeft: `3px solid ${
                      state.lastClarification ? "var(--yellow, #eab308)" : "var(--green)"
                    }`,
                  }}
                >
                  {state.currentQuestion}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <FlowBadge label="Stage" value={state.currentStage} accent="var(--green)" />
                <FlowBadge label="Turn" value={state.currentTurnType} accent="var(--text-2)" />
                <FlowBadge label="Focus" value={state.currentFocus} accent="var(--text)" />
                <FlowBadge
                  label="Difficulty"
                  value={state.currentDifficulty}
                  accent={difficultyColor(state.currentDifficulty)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div
                className="mono text-[11px] uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Your Answer
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className="inline-flex rounded-full border p-1"
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{
                      background: inputMode === "typing" ? "var(--green-dim)" : "transparent",
                      color: inputMode === "typing" ? "var(--green)" : "var(--text-2)",
                    }}
                    onClick={() => setInputMode("typing")}
                    disabled={controlsDisabled}
                  >
                    Typing
                  </button>
                  <button
                    className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{
                      background: inputMode === "hold_to_talk" ? "var(--green-dim)" : "transparent",
                      color: inputMode === "hold_to_talk" ? "var(--green)" : "var(--text-2)",
                    }}
                    onClick={() => {
                      if (!speechSupported) {
                        showToast("Voice input is not supported in this browser.");
                        return;
                      }
                      setInputMode("hold_to_talk");
                    }}
                    disabled={controlsDisabled || !speechSupported}
                  >
                    Hold to talk
                  </button>
                </div>
                <div className="flex items-center gap-3">
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
                      borderColor: ttsEnabled && !avatarEnabled ? "rgba(118,185,0,0.5)" : "var(--border)",
                      background: ttsEnabled && !avatarEnabled ? "var(--green-dim)" : "var(--surface2)",
                      color: ttsEnabled && !avatarEnabled ? "var(--green)" : "var(--text-2)",
                    }}
                    title={
                      avatarEnabled
                        ? "Audio handled by live avatar"
                        : ttsEnabled
                          ? "Voice on — interviewer reads questions aloud"
                          : "Voice off — questions are text-only"
                    }
                    aria-pressed={ttsEnabled && !avatarEnabled}
                    disabled={avatarEnabled}
                  >
                    {ttsEnabled && !avatarEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    <span>
                      Voice{" "}
                      {avatarEnabled
                        ? "avatar"
                        : ttsEnabled
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
                  <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
                    STT:{" "}
                    {speechSupported
                      ? capitalize(sttEngine ?? "browser")
                      : isAudioCaptureSupported() || isSpeechRecognitionSupported()
                        ? "Needs setup"
                        : "Unavailable"}
                  </span>
                </div>
              </div>
              <div className="relative">
                <textarea
                  className="gp-input"
                  style={{
                    minHeight: 240,
                    resize: "vertical",
                    lineHeight: 1.7,
                    paddingBottom: 30,
                  }}
                  placeholder="Answer as if you were in the room: give context, explain your reasoning, and make your tradeoffs concrete."
                  value={
                    inputMode === "typing"
                      ? answer
                      : [answer, interimTranscript].filter(Boolean).join(" ")
                  }
                  onChange={(e) => {
                    if (inputMode !== "typing") return;
                    setAnswer(e.target.value);
                  }}
                  readOnly={inputMode === "hold_to_talk"}
                  disabled={controlsDisabled}
                />
                <div
                  className="mono pointer-events-none absolute bottom-2 right-3 text-xs"
                  style={{ color: "var(--text-3)" }}
                >
                  {answer.length + (inputMode === "hold_to_talk" ? interimTranscript.length : 0)} chars
                </div>
              </div>
              {inputMode === "hold_to_talk" && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-full border"
                    style={{
                      borderColor: isHoldingTalk ? "var(--green)" : "var(--border)",
                      background: isHoldingTalk ? "var(--green-dim)" : "var(--surface2)",
                      color: isHoldingTalk ? "var(--green)" : "var(--text)",
                    }}
                    onPointerDown={startHoldToTalk}
                    onPointerUp={stopHoldToTalk}
                    onPointerLeave={stopHoldToTalk}
                    onPointerCancel={stopHoldToTalk}
                    disabled={controlsDisabled || !speechSupported}
                    aria-label={isHoldingTalk ? "Release to stop recording" : "Hold to talk"}
                    title={isHoldingTalk ? "Release to stop recording" : "Hold to talk"}
                  >
                    <Mic size={18} />
                  </button>
                  <button
                    className="rounded-full border px-3 py-2 text-xs font-semibold"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface2)",
                      color: "var(--text-2)",
                    }}
                    onClick={() => {
                      setAnswer("");
                      setInterimTranscript("");
                    }}
                    disabled={controlsDisabled}
                  >
                    Clear transcript
                  </button>
                  <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
                    Mic: {humanizeLabel(speechStatus)}
                  </span>
                </div>
              )}
            </div>

            {!generating && (
              <button
                className="gp-btn w-full"
                onClick={handleSubmit}
                disabled={!answer.trim() || controlsDisabled}
              >
                {loadingAnswer ? (
                  <>
                    <span className="gp-spinner" /> Evaluating answer...
                  </>
                ) : loadingNext ? (
                  <>
                    <span className="gp-spinner" /> Planning the next turn...
                  </>
                ) : (
                  <>Send Answer →</>
                )}
              </button>
            )}

            {generating && (
              <div
                className="gp-card flex items-center justify-center gap-3 p-6"
                style={{
                  borderColor: "var(--green)",
                  background: "var(--green-dim)",
                }}
              >
                <span className="gp-spinner gp-spinner-green" />
                <span className="text-sm font-medium">Generating your debrief report...</span>
              </div>
            )}

            {state.lastEvaluation && state.rounds.length > 0 && (
              <EvaluationCard
                ev={state.lastEvaluation}
                round={state.rounds.length}
                stage={state.rounds[state.rounds.length - 1].stage}
                roleProfile={roleProfile}
              />
            )}
          </section>

          {showInlineAgents && (
            <AgentPanel
              events={events}
              mode="inline"
              open={showAgents}
              totalTurns={state.totalRounds}
              sessionId={state.sessionId}
            />
          )}
        </div>
      </main>

      {!showInlineAgents && (
        <FloatingAgentToggle
          eventsCount={events.length}
          open={showAgents}
          onToggle={() => setShowAgents((value) => !value)}
        />
      )}

      {showDrawerAgents && (
        <AgentPanel
          events={events}
          mode={isMobile ? "drawer" : "drawer"}
          open
          totalTurns={state.totalRounds}
          sessionId={state.sessionId}
        />
      )}
    </div>
  );
}

function TopBar({
  role,
  company,
  round,
  total,
}: {
  role: string;
  company: string;
  round: number;
  total: number;
}) {
  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 flex h-[60px] items-center justify-between px-5 md:px-8"
      style={{
        background: "rgba(8,8,8,0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid #1a1a1a",
      }}
    >
      <HomeLogo className="text-base" />
      <div className="hidden text-sm md:block">
        <span style={{ color: "var(--text-2)" }}>{role}</span>
        <span style={{ color: "var(--text-3)" }}> @ </span>
        <span>{company}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => {
            const completed = i < round - 1;
            const current = i === round - 1;
            return (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: completed ? "var(--green)" : "transparent",
                  border: `2px solid ${completed || current ? "var(--green)" : "var(--border2)"}`,
                }}
              />
            );
          })}
        </div>
        <div className="mono text-xs" style={{ color: "var(--text-2)" }}>
          Turn {round} of {total}
        </div>
      </div>
    </header>
  );
}

function SessionStrip({
  activeInterviewer,
  stage,
  turnType,
  focus,
  round,
  totalRounds,
  showAgents,
  canInlineAgents,
  onToggleAgents,
}: {
  activeInterviewer: Persona;
  stage: InterviewStage;
  turnType: TurnType;
  focus: string;
  round: number;
  totalRounds: number;
  showAgents: boolean;
  canInlineAgents: boolean;
  onToggleAgents: () => void;
}) {
  return (
    <section className="gp-card flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap gap-3">
        <FlowBadge label="Flow" value={stageLabel(stage)} accent="var(--green)" />
        <FlowBadge label="Move" value={turnType} accent="var(--text-2)" />
        <FlowBadge label="Active" value={activeInterviewer.name} accent="var(--text)" />
        <FlowBadge label="Focus" value={focus} accent="var(--text)" />
        <FlowBadge label="Progress" value={`${round}/${totalRounds}`} accent="var(--text-2)" />
      </div>

      {canInlineAgents && (
        <button
          onClick={onToggleAgents}
          className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold"
          style={{
            borderColor: "var(--border2)",
            background: showAgents ? "var(--green-dim)" : "var(--surface2)",
            color: showAgents ? "var(--green)" : "var(--text)",
          }}
        >
          {showAgents ? "Hide" : "Show"} Agent Trace
        </button>
      )}
    </section>
  );
}

function FlowBadge({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-full border px-3 py-2"
      style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
    >
      <div className="mono text-[10px] uppercase" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      <div className="text-sm font-medium" style={{ color: accent }}>
        {value.includes("_") ? humanizeLabel(value) : value}
      </div>
    </div>
  );
}

function PanelCard({ interviewer, active }: { interviewer: Persona; active: boolean }) {
  return (
    <div
      className="rounded-2xl border p-4 transition-colors"
      style={{
        borderColor: active ? "rgba(118,185,0,0.55)" : "var(--border)",
        background: active ? "rgba(118,185,0,0.08)" : "var(--surface2)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-black"
          style={{
            background: active
              ? "linear-gradient(135deg, var(--green), #4d7a00)"
              : "var(--surface3)",
            color: active ? "#000" : "var(--text)",
          }}
        >
          {initials(interviewer.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-sm font-semibold">{interviewer.name}</div>
            {active && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                style={{
                  background: "var(--green-dim)",
                  color: "var(--green)",
                }}
              >
                Live
              </span>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            {interviewer.title}
          </div>
        </div>
      </div>
      <div
        className="mt-3 rounded-xl px-3 py-2 text-xs"
        style={{ background: "var(--surface3)", color: "var(--text-2)" }}
      >
        {interviewer.focus}
      </div>
      <div className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>
        {interviewer.personality}
      </div>
    </div>
  );
}

function FlowCard({
  stage,
  turnType,
  focus,
  reason,
}: {
  stage: InterviewStage;
  turnType: TurnType;
  focus: string;
  reason: string;
}) {
  return (
    <div className="gp-card p-5">
      <div className="mono text-[11px] uppercase tracking-wider text-[color:var(--text-3)]">
        Interview Flow
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: "var(--green-dim)", color: "var(--green)" }}
        >
          {stageLabel(stage)}
        </span>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: "var(--surface3)", color: "var(--text-2)" }}
        >
          {humanizeLabel(turnType)}
        </span>
      </div>
      <div className="mt-3 text-sm font-medium">{focus}</div>
      <p className="mt-2 text-sm leading-7" style={{ color: "var(--text-2)" }}>
        {reason}
      </p>
    </div>
  );
}

function SpeakerSpotlight({
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

function TypingIndicator() {
  return (
    <div
      className="rounded-[0_12px_12px_12px] p-5"
      style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}
    >
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{
              background: "var(--green)",
              animation: `bounce-dot 1s infinite ${i * 150}ms`,
            }}
          />
        ))}
      </div>
      <div className="mono mt-2 text-xs" style={{ color: "var(--text-3)" }}>
        The panel is deciding how to continue the conversation...
      </div>
    </div>
  );
}

function EvaluationCard({
  ev,
  round,
  stage,
  roleProfile,
}: {
  ev: {
    clarity: number;
    technical_depth: number;
    middle_label?: string;
    structure: number;
    overall: number;
    strengths: string[];
    weaknesses: string[];
    missed_concepts: string[];
    answer_summary: string;
    unresolved_follow_ups: string[];
  };
  round: number;
  stage: InterviewStage;
  roleProfile: RoleProfile;
}) {
  const items = [
    ...(ev.strengths ?? []).map((text) => ({ kind: "s" as const, text })),
    ...(ev.weaknesses ?? []).map((text) => ({ kind: "w" as const, text })),
  ];
  const [revealed, setRevealed] = useState(0);
  const [overallShown, setOverallShown] = useState(0);

  useEffect(() => {
    setRevealed(0);
    setOverallShown(0);
    const start = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - start) / 1000;
      setOverallShown(Math.min(ev.overall, t * ev.overall * 1.2));
      setRevealed((value) => (value < items.length ? value + 1 : value));
      if (t > 2.5) clearInterval(id);
    }, 220);
    return () => clearInterval(id);
  }, [ev, items.length]);

  return (
    <div className="gp-card fade-up p-6">
      <div className="mb-4 flex items-end justify-between">
        <div className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>
          Turn {round} · {stageLabel(stage)}
        </div>
        <div className="mono text-3xl font-bold" style={{ color: scoreToColor(ev.overall) }}>
          {overallShown.toFixed(1)}
          <span className="text-lg" style={{ color: "var(--text-3)" }}>
            /10
          </span>
        </div>
      </div>
      <p className="mb-4 text-sm leading-7" style={{ color: "var(--text-2)" }}>
        {ev.answer_summary}
      </p>
      <div className="flex flex-col gap-3">
        <ScoreBar label="Clarity" score={ev.clarity} delay={0} />
        <ScoreBar label={ev.middle_label ?? "Technical Depth"} score={ev.technical_depth} delay={120} />
        <ScoreBar label="Structure" score={ev.structure} delay={240} />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(34,197,94,0.07)",
            border: "1px solid rgba(34,197,94,0.2)",
          }}
        >
          <div className="mb-2 text-xs font-semibold" style={{ color: "#86efac" }}>
            STRENGTHS
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {ev.strengths?.map((strength, index) =>
              index < revealed ? (
                <li key={index} className="fade-up">
                  ✓ {strength}
                </li>
              ) : null,
            )}
          </ul>
        </div>
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(239,68,68,0.07)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          <div className="mb-2 text-xs font-semibold" style={{ color: "#fca5a5" }}>
            WEAKNESSES
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {ev.weaknesses?.map((weakness, index) => {
              const itemIndex = (ev.strengths?.length ?? 0) + index;
              return itemIndex < revealed ? (
                <li key={index} className="fade-up">
                  ✗ {weakness}
                </li>
              ) : null;
            })}
          </ul>
        </div>
      </div>
      {ev.unresolved_follow_ups?.length > 0 && revealed >= items.length && (
        <div className="mt-4 flex flex-wrap items-center gap-2 fade-up">
          <span className="mono text-[11px]" style={{ color: "var(--yellow)" }}>
            NEXT PROBES:
          </span>
          {ev.unresolved_follow_ups.map((probe, index) => (
            <span
              key={index}
              className="rounded-full px-2.5 py-1 text-xs"
              style={{
                background: "rgba(234,179,8,0.12)",
                color: "#fde68a",
                border: "1px solid rgba(234,179,8,0.3)",
              }}
            >
              {probe}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, score, delay }: { label: string; score: number; delay: number }) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span style={{ color: "var(--text-2)" }}>{label}</span>
        <span className="mono font-semibold">{score}</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface3)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: scoreToColor(score),
            width: `${pct}%`,
            transition: `width 700ms ease ${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}

function FloatingAgentToggle({
  eventsCount,
  open,
  onToggle,
}: {
  eventsCount: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="fixed bottom-4 right-4 z-40 rounded-full border px-4 py-2 text-sm font-semibold"
      style={{
        background: "rgba(8,8,8,0.92)",
        borderColor: "var(--border)",
        color: "var(--green)",
        backdropFilter: "blur(12px)",
      }}
    >
      {open ? "Hide" : "Show"} agents · {eventsCount}
    </button>
  );
}

function AgentPanel({
  events,
  mode,
  open,
  totalTurns,
  sessionId,
}: {
  events: AgentEvent[];
  mode: "inline" | "drawer";
  open: boolean;
  totalTurns: number;
  sessionId: string | null;
}) {
  if (!open) return null;

  // Encoded popout link. Threading totalTurns through the search params
  // means a fresh tab still shows "Turn n / 6" instead of "Turn n / 1".
  const popoutHref = sessionId
    ? `/agents/${encodeURIComponent(sessionId)}?totalTurns=${totalTurns}`
    : null;

  return (
    <aside
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border",
        mode === "inline"
          ? "gp-card min-h-[720px]"
          : "fixed inset-x-4 bottom-20 top-24 z-40 bg-[rgba(8,8,8,0.96)] shadow-2xl",
      )}
      style={{
        borderColor: "var(--border)",
        background: mode === "inline" ? "var(--surface)" : "rgba(8,8,8,0.96)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          <span>Agent Trace</span>
          <span
            className="mono rounded-sm px-1.5 py-[1px] text-[9px] uppercase tracking-wider"
            style={{ background: "rgba(118,185,0,0.15)", color: "var(--green)" }}
          >
            multi-agent
          </span>
        </div>
        <div className="flex items-center gap-2">
          {popoutHref && (
            <a
              href={popoutHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mono rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors hover:bg-[rgba(255,255,255,0.04)]"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-2)",
                background: "rgba(0,0,0,0.4)",
              }}
              title="Open in dedicated mission control tab"
            >
              pop out ↗
            </a>
          )}
          <div className="mono flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: "var(--green)",
                animation: "bounce-dot 1.2s infinite",
              }}
            />
            LIVE
          </div>
        </div>
      </div>
      <AgentDashboard events={events} totalTurns={totalTurns} variant={mode} />
    </aside>
  );
}
