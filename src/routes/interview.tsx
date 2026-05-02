import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAppState, store } from "@/lib/ghost-store";
import { submitAnswer, generateReport, fetchAgentLogs } from "@/server/interview.functions";
import { showToast } from "@/components/ghost/Toaster";
import { difficultyColor, scoreToColor, capitalize, initials } from "@/lib/ghost-utils";

type AgentEvent = { id: string; ts: number; agent: string; phase: string; message: string; meta?: Record<string, unknown> };

export const Route = createFileRoute("/interview")({
  head: () => ({
    meta: [{ title: "Interview · Mockpilot" }],
  }),
  component: InterviewPage,
});

function InterviewPage() {
  const state = useAppState();
  const nav = useNavigate();
  const [answer, setAnswer] = useState("");
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAgents, setShowAgents] = useState(true);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const sinceRef = useRef(0);

  // Poll agent logs
  useEffect(() => {
    if (!state.sessionId) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetchAgentLogs({ data: { sessionId: state.sessionId!, since: sinceRef.current } });
        if (!alive) return;
        if (res.events.length) {
          sinceRef.current = res.events[res.events.length - 1].ts;
          setEvents((prev) => [...prev, ...(res.events as AgentEvent[])].slice(-200));
        }
      } catch {/* ignore */}
    };
    const id = setInterval(tick, 800);
    tick();
    return () => { alive = false; clearInterval(id); };
  }, [state.sessionId]);

  if (!state.sessionId) return <Navigate to="/" />;

  async function handleSubmit() {
    if (!answer.trim() || loadingAnswer || loadingNext) return;
    setLoadingAnswer(true);
    try {
      const res = await submitAnswer({ data: { sessionId: state.sessionId!, answer } });

      // Clarification path — interviewer asks for more
      if (res.clarification) {
        store.set({
          currentQuestion: res.follow_up!,
          lastClarification: res.follow_up!,
        });
        setAnswer("");
        setLoadingAnswer(false);
        return;
      }

      store.set({ lastEvaluation: res.evaluation, lastClarification: null });

      if (res.done) {
        setLoadingAnswer(false);
        setGenerating(true);
        try {
          const report = await generateReport({ data: { sessionId: state.sessionId! } });
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
          currentQuestion: res.next_question!,
          currentTopic: res.topic!,
          currentDifficulty: res.difficulty!,
          currentRound: res.round!,
        });
        setAnswer("");
        setLoadingNext(false);
      }, 2200);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to submit answer");
      setLoadingAnswer(false);
    }
  }

  const setup = state.setupData!;
  const persona = state.interviewer!;

  return (
    <div className="min-h-screen">
      <TopBar role={setup.role} company={setup.company} round={state.currentRound} total={state.totalRounds} />

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-5 pb-16 pt-24 md:grid-cols-[42%_1fr] md:gap-10 md:px-10">
        {/* LEFT */}
        <div className="flex flex-col gap-6">
          <div className="gp-card p-6 fade-up">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-black pulse-ring"
                style={{ background: "linear-gradient(135deg, var(--green), #4d7a00)" }}
              >
                {initials(persona.name)}
              </div>
              <div className="flex-1">
                <div className="text-base font-bold">{persona.name}</div>
                <div className="text-sm" style={{ color: "var(--text-2)" }}>
                  {persona.title} @ {persona.company}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <span
                className="inline-block rounded-full px-3 py-1 text-xs font-medium"
                style={{ background: "var(--green-dim)", color: "var(--green)" }}
              >
                {persona.personality}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs mono" style={{ color: "var(--text-2)" }}>
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: loadingNext ? "var(--green)" : "var(--text-3)",
                  animation: loadingNext ? "bounce-dot 1s infinite" : "none",
                }}
              />
              {loadingNext ? "Interviewing" : "Waiting for your answer"}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="mono text-[11px] uppercase tracking-wider flex items-center gap-2" style={{ color: state.lastClarification ? "var(--yellow)" : "var(--text-3)" }}>
              {state.lastClarification ? "↳ Follow-up" : "Question"}
            </div>
            {loadingNext ? (
              <TypingIndicator />
            ) : (
              <div
                key={state.currentQuestion}
                className="fade-up rounded-[0_12px_12px_12px] p-5 text-[15px] leading-relaxed md:text-base"
                style={{
                  background: "var(--surface2)",
                  borderLeft: `3px solid ${state.lastClarification ? "var(--yellow, #eab308)" : "var(--green)"}`,
                }}
              >
                {state.currentQuestion}
              </div>
            )}
            <div className="mt-1 flex flex-wrap gap-3">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]"
                style={{ background: "var(--surface3)", borderColor: "var(--border)" }}
              >
                📊 {state.currentTopic}
              </span>
              <span
                className="inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-medium"
                style={{
                  color: difficultyColor(state.currentDifficulty),
                  background: `${difficultyColor(state.currentDifficulty)}22`,
                  border: `1px solid ${difficultyColor(state.currentDifficulty)}55`,
                }}
              >
                {capitalize(state.currentDifficulty)}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              Your Answer
            </div>
            <div className="relative">
              <textarea
                className="gp-input"
                style={{ minHeight: 240, resize: "vertical", lineHeight: 1.7, paddingBottom: 30 }}
                placeholder="Type your answer here. Speak your mind — there are no tricks, just explain your thinking clearly."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={loadingAnswer || loadingNext || generating}
              />
              <div className="mono pointer-events-none absolute bottom-2 right-3 text-xs" style={{ color: "var(--text-3)" }}>
                {answer.length} chars
              </div>
            </div>
          </div>

          {!generating && (
            <button
              className="gp-btn w-full"
              onClick={handleSubmit}
              disabled={!answer.trim() || loadingAnswer || loadingNext}
            >
              {loadingAnswer ? (
                <>
                  <span className="gp-spinner" /> Evaluating...
                </>
              ) : (
                <>Submit Answer →</>
              )}
            </button>
          )}

          {generating && (
            <div
              className="gp-card flex items-center justify-center gap-3 p-6"
              style={{ borderColor: "var(--green)", background: "var(--green-dim)" }}
            >
              <span className="gp-spinner gp-spinner-green" />
              <span className="text-sm font-medium">Generating your debrief report...</span>
            </div>
          )}

          {state.lastEvaluation && <EvaluationCard ev={state.lastEvaluation} round={state.rounds.length + (loadingNext ? 0 : 0) || state.currentRound - (loadingNext ? 1 : 0)} />}
        </div>
      </main>

      <AgentPanel events={events} open={showAgents} onToggle={() => setShowAgents((v) => !v)} />
    </div>
  );
}

function TopBar({ role, company, round, total }: { role: string; company: string; round: number; total: number }) {
  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 flex h-[60px] items-center justify-between px-5 md:px-10"
      style={{
        background: "rgba(8,8,8,0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid #1a1a1a",
      }}
    >
      <div className="font-bold" style={{ color: "var(--green)" }}>🧭 Mockpilot</div>
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
          Round {round} of {total}
        </div>
      </div>
    </header>
  );
}

function TypingIndicator() {
  return (
    <div className="rounded-[0_12px_12px_12px] p-5" style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--green)", animation: `bounce-dot 1s infinite ${i * 150}ms` }}
          />
        ))}
      </div>
      <div className="mono mt-2 text-xs" style={{ color: "var(--text-3)" }}>Thinking...</div>
    </div>
  );
}

function EvaluationCard({ ev, round }: { ev: { clarity: number; technical_depth: number; structure: number; overall: number; strengths: string[]; weaknesses: string[]; missed_concepts: string[] }; round: number }) {
  const items = [...(ev.strengths ?? []).map((s) => ({ kind: "s" as const, text: s })), ...(ev.weaknesses ?? []).map((s) => ({ kind: "w" as const, text: s }))];
  const [revealed, setRevealed] = useState(0);
  const [overallShown, setOverallShown] = useState(0);
  useEffect(() => {
    setRevealed(0); setOverallShown(0);
    const start = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - start) / 1000;
      setOverallShown(Math.min(ev.overall, t * ev.overall * 1.2));
      setRevealed((r) => (r < items.length ? r + 1 : r));
      if (t > 2.5) clearInterval(id);
    }, 220);
    return () => clearInterval(id);
  }, [ev]);

  return (
    <div className="gp-card fade-up p-6">
      <div className="mb-4 flex items-end justify-between">
        <div className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>Round {round} · Live evaluation</div>
        <div className="mono text-3xl font-bold" style={{ color: scoreToColor(ev.overall) }}>
          {overallShown.toFixed(1)}
          <span className="text-lg" style={{ color: "var(--text-3)" }}>/10</span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <ScoreBar label="Clarity" score={ev.clarity} delay={0} />
        <ScoreBar label="Technical Depth" score={ev.technical_depth} delay={120} />
        <ScoreBar label="Structure" score={ev.structure} delay={240} />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg p-3" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <div className="mb-2 text-xs font-semibold" style={{ color: "#86efac" }}>STRENGTHS</div>
          <ul className="flex flex-col gap-1 text-sm">
            {ev.strengths?.map((s, i) => {
              const idx = i;
              return idx < revealed ? <li key={i} className="fade-up">✓ {s}</li> : null;
            })}
          </ul>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div className="mb-2 text-xs font-semibold" style={{ color: "#fca5a5" }}>WEAKNESSES</div>
          <ul className="flex flex-col gap-1 text-sm">
            {ev.weaknesses?.map((s, i) => {
              const idx = (ev.strengths?.length ?? 0) + i;
              return idx < revealed ? <li key={i} className="fade-up">✗ {s}</li> : null;
            })}
          </ul>
        </div>
      </div>
      {ev.missed_concepts?.length > 0 && revealed >= items.length && (
        <div className="mt-4 flex flex-wrap items-center gap-2 fade-up">
          <span className="mono text-[11px]" style={{ color: "var(--yellow)" }}>MISSED:</span>
          {ev.missed_concepts.map((c, i) => (
            <span
              key={i}
              className="rounded-full px-2.5 py-1 text-xs"
              style={{ background: "rgba(234,179,8,0.12)", color: "#fde68a", border: "1px solid rgba(234,179,8,0.3)" }}
            >
              {c}
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
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface3)" }}>
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

function agentColor(agent: string): string {
  const map: Record<string, string> = {
    System: "#94a3b8",
    PersonaGen: "#a78bfa",
    Coordinator: "#38bdf8",
    Interviewer: "#76b900",
    Clarifier: "#eab308",
    Evaluator: "#f97316",
    Reporter: "#ec4899",
  };
  return map[agent] ?? "#888";
}

function AgentPanel({ events, open, onToggle }: { events: AgentEvent[]; open: boolean; onToggle: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events]);

  return (
    <>
      <button
        onClick={onToggle}
        className="fixed right-4 top-20 z-40 rounded-full px-3 py-2 text-xs font-semibold mono"
        style={{
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          color: "var(--green)",
        }}
      >
        {open ? "Hide" : "Show"} agents · {events.length}
      </button>
      {open && (
        <aside
          className="fixed bottom-4 right-4 top-32 z-40 flex w-[360px] max-w-[92vw] flex-col rounded-xl"
          style={{ background: "rgba(8,8,8,0.95)", border: "1px solid var(--border)", backdropFilter: "blur(12px)" }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <div className="text-sm font-bold">🧠 Agent Activity</div>
            <div className="mono text-[10px]" style={{ color: "var(--text-3)" }}>LIVE</div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
            {events.length === 0 && (
              <div className="mono p-3 text-xs" style={{ color: "var(--text-3)" }}>Waiting for agents...</div>
            )}
            {events.map((e) => (
              <div key={e.id} className="mb-2 rounded-lg p-2.5" style={{ background: "var(--surface2)", borderLeft: `3px solid ${agentColor(e.agent)}` }}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="mono font-bold" style={{ color: agentColor(e.agent) }}>{e.agent}</span>
                  <span className="mono" style={{ color: "var(--text-3)" }}>
                    {e.phase} · {new Date(e.ts).toLocaleTimeString().slice(0, 8)}
                  </span>
                </div>
                <div className="mt-1 text-[12px]" style={{ color: "var(--text-1)" }}>{e.message}</div>
                {e.meta && Object.keys(e.meta).length > 0 && (
                  <pre className="mono mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[10px]" style={{ color: "var(--text-3)" }}>
                    {JSON.stringify(e.meta, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}
    </>
  );
}
