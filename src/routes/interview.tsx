import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, VolumeX } from "lucide-react";
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
import { createTtsController, primeAudio, type TtsController, type TtsStatus } from "@/lib/tts";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { fetchAgentLogs, generateReport, submitAnswer } from "@/server/interview.functions";
import type { InterviewStage, Persona, RoleProfile, TurnType } from "@/server/sessions.server";

const TTS_ENABLED_STORAGE_KEY = "mockpilot:ttsEnabled";

type AgentEvent = {
  id: string;
  ts: number;
  agent: string;
  phase: string;
  message: string;
  meta?: Record<string, unknown>;
};

export const Route = createFileRoute("/interview")({
  head: () => ({
    meta: [{ title: "Interview · Mockpilot" }],
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
  const sinceRef = useRef(0);
  const sttProxyUrl = (import.meta.env.VITE_STT_PROXY_URL as string | undefined)?.trim();
  const ttsProxyUrl =
    (import.meta.env.VITE_TTS_PROXY_URL as string | undefined)?.trim() || "/api/tts";
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(TTS_ENABLED_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>("idle");
  const lastSpokenKeyRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TTS_ENABLED_STORAGE_KEY, String(ttsEnabled));
  }, [ttsEnabled]);

  const currentQuestion = state.currentQuestion;
  const activeInterviewerId = state.activeInterviewer?.id;
  const activeVoice = state.activeInterviewer?.voice;
  const sessionId = state.sessionId;
  const speakingBlocked = loadingAnswer || loadingNext || generating || isHoldingTalk;

  useEffect(() => {
    if (!ttsEnabled) {
      ttsRef.current?.stop();
      // Keep lastSpokenKeyRef populated so re-enabling doesn't replay the
      // current question; voice-on means "start hearing future questions".
      return;
    }
    if (!currentQuestion || !activeInterviewerId || !activeVoice) return;
    if (speakingBlocked) return;

    const key = `${activeInterviewerId}::${currentQuestion}`;
    if (lastSpokenKeyRef.current === key) return;
    lastSpokenKeyRef.current = key;

    void ttsRef.current?.speak(currentQuestion, activeVoice, sessionId);
  }, [
    ttsEnabled,
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
                      borderColor: ttsEnabled ? "rgba(118,185,0,0.5)" : "var(--border)",
                      background: ttsEnabled ? "var(--green-dim)" : "var(--surface2)",
                      color: ttsEnabled ? "var(--green)" : "var(--text-2)",
                    }}
                    title={
                      ttsEnabled
                        ? "Voice on — interviewer reads questions aloud"
                        : "Voice off — questions are text-only"
                    }
                    aria-pressed={ttsEnabled}
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

          {showInlineAgents && <AgentPanel events={events} mode="inline" open={showAgents} />}
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
        <AgentPanel events={events} mode={isMobile ? "drawer" : "drawer"} open />
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
}: {
  interviewer: Persona;
  loadingNext: boolean;
  lastClarification: string | null;
  ttsStatus: TtsStatus;
}) {
  const speaking = ttsStatus === "playing";
  const loadingTts = ttsStatus === "loading";
  const indicatorActive = loadingNext || speaking || loadingTts;

  return (
    <div className="gp-card p-6 fade-up">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-black",
            speaking || loadingTts ? "pulse-ring" : "",
          )}
          style={{ background: "linear-gradient(135deg, var(--green), #4d7a00)" }}
        >
          {initials(interviewer.name)}
        </div>
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
        {loadingNext
          ? "Planning the next conversational move"
          : speaking
            ? "Speaking the question"
            : loadingTts
              ? "Synthesizing voice"
              : lastClarification
                ? "Continuing the same answer with clarification"
                : "Listening for your answer"}
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

function agentColor(agent: string): string {
  const map: Record<string, string> = {
    System: "#94a3b8",
    PanelGen: "#a78bfa",
    CandidateContext: "#f59e0b",
    Coordinator: "#38bdf8",
    Interviewer: "#76b900",
    Clarifier: "#eab308",
    Evaluator: "#f97316",
    Reporter: "#ec4899",
    Speaker: "#22d3ee",
  };
  return map[agent] ?? "#888";
}

function AgentPanel({
  events,
  mode,
  open,
}: {
  events: AgentEvent[];
  mode: "inline" | "drawer";
  open: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, open]);

  if (!open) return null;

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
        <div className="text-sm font-bold">🧠 Agent Activity</div>
        <div className="mono text-[10px]" style={{ color: "var(--text-3)" }}>
          LIVE
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        {events.length === 0 && (
          <div className="mono p-3 text-xs" style={{ color: "var(--text-3)" }}>
            Waiting for agents...
          </div>
        )}
        {events.map((event) => (
          <div
            key={event.id}
            className="mb-2 rounded-lg p-2.5"
            style={{
              background: "var(--surface2)",
              borderLeft: `3px solid ${agentColor(event.agent)}`,
            }}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="mono font-bold" style={{ color: agentColor(event.agent) }}>
                {event.agent}
              </span>
              <span className="mono" style={{ color: "var(--text-3)" }}>
                {event.phase} · {new Date(event.ts).toLocaleTimeString().slice(0, 8)}
              </span>
            </div>
            <div className="mt-1 text-[12px]">{event.message}</div>
            {event.meta && Object.keys(event.meta).length > 0 && (
              <pre
                className="mono mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[10px]"
                style={{ background: "rgba(255,255,255,0.02)", color: "var(--text-3)" }}
              >
                {JSON.stringify(event.meta, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
