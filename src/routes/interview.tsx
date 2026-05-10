import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { showToast } from "@/components/ghost/Toaster";
import { useIsMobile } from "@/hooks/use-mobile";
import { store, useAppState } from "@/lib/ghost-store";
import { difficultyColor } from "@/lib/ghost-utils";
import { createAvatarController, type AvatarController, type AvatarStatus } from "@/lib/avatar";
import { primeAudio } from "@/lib/tts";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { fetchAgentLogs, generateReport, submitAnswer } from "@/server/interview.functions";
import { useTrack } from "@/lib/use-track";
import { uploadSessionData, uploadSessionMetadata } from "@/server/upload.functions";
import { useKeystrokeTracker } from "@/hooks/useKeystrokeTracker";
import { useCamRecorder } from "@/hooks/useCamRecorder";
import { useBehavioralTracker } from "@/hooks/useBehavioralTracker";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import { useCameraAnalyzer } from "@/hooks/useCameraAnalyzer";
import { ConsentModal, type ConsentChoices } from "@/components/interview/ConsentModal";
import { TutorialOverlay, shouldShowTutorial } from "@/components/interview/TutorialOverlay";
import { FeedbackModal } from "@/components/interview/FeedbackModal";
import { cn } from "@/lib/utils";

import { TopBar } from "@/components/interview/TopBar";
import { PanelCard } from "@/components/interview/PanelCard";
import { SpeakerSpotlight } from "@/components/interview/SpeakerSpotlight";
import { EvaluationCard } from "@/components/interview/EvaluationCard";
import { AnswerInput } from "@/components/interview/AnswerInput";
import { MobileDrawer } from "@/components/interview/MobileDrawer";
import { SessionStrip, FlowBadge, FlowCard } from "@/components/interview/DevStrip";
import { AgentPanel, FloatingAgentToggle } from "@/components/interview/AgentPanel";
import { TypingIndicator } from "@/components/interview/TypingIndicator";
import { WebcamFeed } from "@/components/interview/WebcamFeed";
import { useTTS } from "@/hooks/useTTS";
import { useSpeech } from "@/hooks/useSpeech";

import type { AgentEvent } from "@/components/agent-dashboard/types";

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
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isHoldingTalk, setIsHoldingTalk] = useState(false);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [canInlineAgents, setCanInlineAgents] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const avatarRef = useRef<AvatarController | null>(null);
  const avatarVideoElRef = useRef<HTMLVideoElement | null>(null);
  const sinceRef = useRef(0);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [consent, setConsent] = useState<ConsentChoices | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { getPayload: getKeystrokes } = useKeystrokeTracker(!!state.sessionId);
  const { getBlob: getCamBlob } = useCamRecorder(camStream);
  const { onQuestionShown, onAnswerSubmitted, onKeyDown: onAnswerKeyDown, onPaste: onAnswerPaste, getPayload: getBehavioral, locationRef } = useBehavioralTracker(consent ?? { microphone: false, camera: false, location: false });
  const audio = useAudioAnalyzer(consent?.microphone ?? false);
  const audioStoppedRef = useRef(false);
  const camAnalyzer = useCameraAnalyzer(consent?.camera ?? false, camStream);

  const sttProxyUrl = (import.meta.env.VITE_STT_PROXY_URL as string | undefined)?.trim() || "/api/stt";
  const ttsProxyUrl =
    (import.meta.env.VITE_TTS_PROXY_URL as string | undefined)?.trim() || "/api/tts";
  const avatarProxyUrl =
    (import.meta.env.VITE_AVATAR_PROXY_URL as string | undefined)?.trim() || "/api/tts-avatar";

  const { ttsRef, ttsStatus, ttsEnabled, setTtsEnabled } = useTTS(ttsProxyUrl);
  const { recognitionRef, speechSupported } = useSpeech(
    sttProxyUrl,
    setAnswer,
    setInterimTranscript,
    setIsHoldingTalk,
  );

  /** Dedupes automatic playback only **after** a question audibly succeeds; avoids locking out retries on transient TTS/play failures (first prompt often hit this). */
  const lastSuccessfullySpokenKeyRef = useRef<string | null>(null);

  // Avatar is disabled — feature is Coming Soon. Clear any stale localStorage value
  // so returning users who had it on don't get stuck in a broken state.
  const [avatarEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AVATAR_ENABLED_STORAGE_KEY);
    }
    return false;
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
    window.localStorage.setItem(AVATAR_ENABLED_STORAGE_KEY, String(avatarEnabled));
  }, [avatarEnabled]);

  const track = useTrack();
  const currentQuestion = state.currentQuestion;
  const activeInterviewerId = state.activeInterviewer?.id;
  const activeVoice = state.activeInterviewer?.voice;
  const sessionId = state.sessionId;

  // Fire interview_abandoned when the user navigates away mid-session.
  // Uses a ref so the handler always sees fresh state without re-registering.
  const sessionIdRef = useRef(sessionId);
  const roundsRef = useRef(state.currentRound ?? 0);
  const isDoneRef = useRef(false);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { roundsRef.current = state.currentRound ?? 0; }, [state.currentRound]);
  useEffect(() => {
    function onUnload() {
      if (sessionIdRef.current && !isDoneRef.current) {
        track("interview_abandoned", {
          session_id: sessionIdRef.current,
          rounds_completed: roundsRef.current,
        });
      }
    }
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const speakingBlocked = loadingAnswer || loadingNext || generating || isHoldingTalk;

  // Safari autoplay fix: called from a real user gesture so the browser
  // grants a fresh autoplay permission, then replays the current question.
  function handleReplayRequest() {
    if (!currentQuestion || !activeVoice || !ttsRef.current) return;
    primeAudio();
    lastSuccessfullySpokenKeyRef.current = null; // reset so the speak effect re-fires
    ttsRef.current.speak(currentQuestion, activeVoice, sessionId).catch(() => undefined);
  }

  useEffect(() => {
    if (consent === null) return; // don't speak until user dismisses consent modal
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
    consent,
    ttsEnabled,
    avatarEnabled,
    currentQuestion,
    activeInterviewerId,
    activeVoice,
    sessionId,
    speakingBlocked,
    ttsRef,
  ]);

  // Avatar auto-speak: when avatarEnabled, fetch+play the lip-synced video
  // and suppress the plain TTS so audio doesn't play twice.
  useEffect(() => {
    if (consent === null) return; // don't speak until user dismisses consent modal
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
    consent,
    avatarEnabled,
    currentQuestion,
    activeInterviewerId,
    activeVoice,
    sessionId,
    speakingBlocked,
    ttsRef,
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


  // Start consent-gated analyzers once user confirms
  useEffect(() => {
    if (!consent) return;
    if (consent.microphone) void audio.start();
    if (consent.camera) void camAnalyzer.start();
    if (consent.location) {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          locationRef.current = {
            lat: Math.round(pos.coords.latitude * 10) / 10,
            lng: Math.round(pos.coords.longitude * 10) / 10,
            accuracy: Math.round(pos.coords.accuracy),
          };
        },
        () => {},
        { timeout: 8000 },
      );
    }
    return () => {
      audio.stop();
      camAnalyzer.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent]);

  // Track question changes for behavioral analytics
  const questionIndexRef = useRef(0);
  useEffect(() => {
    if (!state.currentQuestion) return;
    onQuestionShown(questionIndexRef.current, state.currentQuestion);
    audio.onQuestionShown(questionIndexRef.current);
    camAnalyzer.onQuestionShown(questionIndexRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentQuestion]);

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

      // Record answer for behavioral analytics
      onAnswerSubmitted(questionIndexRef.current, answer);
      audio.onAnswerSubmitted(questionIndexRef.current);
      camAnalyzer.onAnswerSubmitted(questionIndexRef.current);

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

      questionIndexRef.current += 1;

      const currentRounds = store.get().rounds;
      store.set({
        lastEvaluation: res.evaluation,
        lastClarification: null,
        rounds: [...currentRounds, res.completedRound],
      });

      if (res.done) {
        isDoneRef.current = true; // prevent interview_abandoned from firing on unload
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

          // Start 30s post-interview mic capture, then stop
          if (consent?.microphone && !audioStoppedRef.current) {
            audioStoppedRef.current = true;
            audio.startPostInterview(30000);
          } else if (!audioStoppedRef.current) {
            audioStoppedRef.current = true;
            audio.stop();
          }

          if (accessToken && state.sessionId) {
            const sid = state.sessionId;
            // Fire-and-forget: upload keystrokes
            uploadSessionData({
              data: { accessToken, sessionId: sid, type: "keystrokes", payload: getKeystrokes() },
            }).then((r) => {
              console.log("[upload] keystrokes", r);
            }).catch((err) => {
              console.error("[upload] keystrokes failed", err);
            });
            // Upload behavioral after 31s so post-interview mic segment is captured
            setTimeout(() => {
              const behavioralPayload = {
                ...getBehavioral(),
                microphone: audio.getPayload(),
                camera: camAnalyzer.getPayload(),
              };
              uploadSessionData({
                data: { accessToken, sessionId: sid, type: "behavioral", payload: JSON.stringify(behavioralPayload) },
              }).then((r) => {
                console.log("[upload] behavioral", r);
              }).catch((err) => {
                console.error("[upload] behavioral failed", err);
              });
            }, consent?.microphone ? 31000 : 0);
            // Fire-and-forget: upload cam recording via server route (avoids CORS)
            getCamBlob().then(async (result) => {
              console.log("[upload] cam blob", result ? `${result.mimeType} ${result.blob.size}b` : camStream ? "no chunks (camera on but empty)" : "no stream (camera was off)");
              if (!result) return;
              const fd = new FormData();
              fd.append("file", new File([result.blob], `cam.${result.mimeType.includes("mp4") ? "mp4" : "webm"}`, { type: result.mimeType }));
              fd.append("accessToken", accessToken);
              fd.append("sessionId", sid);
              const res = await fetch("/api/upload-cam", { method: "POST", body: fd });
              console.log("[upload] cam", res.status, await res.json().catch(() => null));
            }).catch((err) => {
              console.error("[upload] cam failed", err);
            });
            // Fire-and-forget: upload session metadata.json + integrity signals
            const _behavioralSummary = getBehavioral();
            uploadSessionMetadata({
              data: {
                accessToken,
                sessionId: sid,
                browser: navigator.userAgent,
                paste_count: _behavioralSummary.summary.totalPastes,
                tab_switches: _behavioralSummary.summary.totalTabSwitches,
                camera_consent: consent?.camera ?? false,
              },
            }).then((r) => {
              console.log("[upload] metadata", r);
            }).catch((err) => {
              console.error("[upload] metadata failed", err);
            });
          } else {
            console.warn("[upload] skipped — no accessToken or sessionId", { hasToken: !!accessToken, sessionId: state.sessionId });
          }

          setTimeout(() => setShowFeedbackModal(true), 3000);
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
    if (controlsDisabled || !speechSupported) return;
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
      {consent === null && (
        <ConsentModal onConfirm={(c) => { setConsent(c); setShowTutorial(shouldShowTutorial()); }} />
      )}
      {showTutorial && consent !== null && (
        <TutorialOverlay onDone={() => setShowTutorial(false)} />
      )}
      {showFeedbackModal && (
        <FeedbackModal
          sessionId={state.sessionId!}
          accessToken={getAccessToken() ?? ""}
          onClose={() => {
            setShowFeedbackModal(false);
            nav({ to: "/report" });
          }}
        />
      )}
      <TopBar
        role={setup.role}
        company={setup.company}
        round={state.currentRound}
        total={state.totalRounds}
        onShowPanel={() => setShowMobilePanel(true)}
        activeInterviewer={activeInterviewer}
      />

      <main className="mx-auto max-w-[1600px] px-4 pb-20 pt-20 md:px-8 md:pt-24">
        {devMode && (
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
        )}

        <MobileDrawer
          open={showMobilePanel}
          onClose={() => setShowMobilePanel(false)}
          interviewers={state.interviewers}
          activeInterviewerId={activeInterviewer.id}
          devMode={devMode}
          currentStage={state.currentStage}
          currentTurnType={state.currentTurnType}
          currentFocus={state.currentFocus}
          currentCoordinatorReason={state.currentCoordinatorReason}
        />

        <div
          className={cn(
            "mt-6 grid gap-6",
            showInlineAgents
              ? "xl:grid-cols-[320px_minmax(0,1fr)_360px]"
              : "xl:grid-cols-[320px_minmax(0,1fr)]",
          )}
        >
          {/* Left sidebar — hidden on mobile, shown as drawer instead */}
          <section className="hidden xl:flex flex-col gap-4">
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

            {devMode && (
              <FlowCard
                stage={state.currentStage}
                turnType={state.currentTurnType}
                focus={state.currentFocus}
                reason={state.currentCoordinatorReason}
              />
            )}
          </section>

          <section className="flex flex-col gap-5">
            {/* Floating webcam PIP — renders as fixed overlay when on */}
            <WebcamFeed onStream={setCamStream} />
            <SpeakerSpotlight
              interviewer={activeInterviewer}
              loadingNext={loadingNext}
              lastClarification={state.lastClarification}
              ttsStatus={ttsStatus}
              avatarStatus={avatarStatus}
              avatarEnabled={avatarEnabled}
              avatarVideoRef={avatarVideoElRef}
              onReplayRequest={ttsEnabled ? handleReplayRequest : undefined}
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
              {devMode && (
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
              )}
            </div>

            <AnswerInput
              answer={answer}
              setAnswer={setAnswer}
              controlsDisabled={controlsDisabled}
              speechSupported={speechSupported}
              isHoldingTalk={isHoldingTalk}
              interimTranscript={interimTranscript}
              ttsEnabled={ttsEnabled}
              setTtsEnabled={setTtsEnabled}
              ttsStatus={ttsStatus}
              ttsRef={ttsRef}
              startHoldToTalk={startHoldToTalk}
              stopHoldToTalk={stopHoldToTalk}
              devMode={devMode}
              setDevMode={setDevMode}
              onKeyDown={onAnswerKeyDown}
              onPaste={onAnswerPaste}
            />

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
          mode="drawer"
          open
          totalTurns={state.totalRounds}
          sessionId={state.sessionId}
          onClose={() => setShowAgents(false)}
        />
      )}

    </div>
  );
}
