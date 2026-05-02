import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAppState, store } from "@/lib/ghost-store";
import { getHireBg, getHireColor, scoreToColor, difficultyColor, capitalize } from "@/lib/ghost-utils";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [{ title: "Debrief Report · Mockpilot" }],
  }),
  component: ReportPage,
});

function ReportPage() {
  const state = useAppState();
  const nav = useNavigate();
  if (!state.report) return <Navigate to="/" />;
  const r = state.report;

  return (
    <div className="grid-bg min-h-screen pb-24">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8">
        <div className="font-bold" style={{ color: "var(--green)" }}>🧭 Mockpilot</div>
        <div className="mono text-xs" style={{ color: "var(--text-3)" }}>DEBRIEF REPORT</div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pt-12">
        <Hero score={r.overall_score} decision={r.hire_decision} role={r.role} company={r.company} />

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          <ColumnCard title="Strengths" color="#76b900" icon="✓" items={r.strengths} itemColor="#76b900" />
          <ColumnCard title="Weaknesses" color="#ef4444" icon="✗" items={r.weaknesses} itemColor="#fca5a5" />
          <ColumnCard
            title="Focus Areas"
            color="#eab308"
            icon="🎯"
            items={Array.from(new Set(r.rounds.flatMap((rd) => rd.evaluation.missed_concepts || []))).slice(0, 5)}
            itemColor="#fde68a"
          />
        </div>

        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">🎯 Practice These Next</h2>
          <div className="flex flex-col gap-3">
            {r.drill_questions.map((q, i) => (
              <DrillCard key={i} index={i + 1} text={q} />
            ))}
          </div>
        </section>

        <section className="mt-12 gp-card p-7 md:p-8">
          <h2 className="mb-3 text-xl font-bold">📋 Your Personal Study Plan</h2>
          <p className="text-[15px] leading-[1.8]" style={{ color: "var(--text-2)" }}>{r.study_plan}</p>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">Session Breakdown</h2>
          <div className="flex flex-col gap-2">
            {r.rounds.map((rd, i) => (
              <RoundAccordion key={i} index={i} round={rd} />
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-col gap-3 md:flex-row">
          <button
            className="gp-btn gp-btn-outline w-full md:flex-1"
            onClick={() => {
              store.reset();
              nav({ to: "/" });
            }}
          >
            ↩ Start New Interview
          </button>
          <CopyReportButton />
        </div>
      </main>
    </div>
  );
}

function Hero({ score, decision, role, company }: { score: number; decision: string; role: string; company: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 1200;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShown(score * (0.5 - 0.5 * Math.cos(Math.PI * p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className="text-center fade-up">
      <div className="flex items-end justify-center gap-1">
        <span className="mono text-7xl font-extrabold leading-none md:text-8xl" style={{ color: "var(--green)" }}>
          {shown.toFixed(1)}
        </span>
        <span className="mono pb-2 text-3xl" style={{ color: "var(--text-3)" }}>/10</span>
      </div>
      <div className="mt-6 flex justify-center">
        <span
          className="rounded-full px-6 py-2.5 text-base font-bold uppercase tracking-wide"
          style={{
            background: getHireBg(decision),
            color: getHireColor(decision),
            border: `1px solid ${getHireColor(decision)}`,
          }}
        >
          {decision}
        </span>
      </div>
      <div className="mt-4 text-sm" style={{ color: "var(--text-2)" }}>
        Based on 5 rounds · {role} @ {company}
      </div>
    </div>
  );
}

function ColumnCard({ title, color, icon, items, itemColor }: { title: string; color: string; icon: string; items: string[]; itemColor: string }) {
  return (
    <div className="gp-card p-6" style={{ borderTop: `2px solid ${color}` }}>
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <span style={{ color }}>{icon}</span>
        {title}
      </div>
      <ul className="flex flex-col gap-2 text-sm" style={{ color: "var(--text-2)" }}>
        {items.length === 0 && <li style={{ color: "var(--text-3)" }}>—</li>}
        {items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span style={{ color: itemColor }}>{icon}</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DrillCard({ index, text }: { index: number; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="relative rounded-[0_12px_12px_12px] p-5 pr-12"
      style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}
    >
      <div className="mono mb-2 text-xs font-bold" style={{ color: "var(--green)" }}>
        {String(index).padStart(2, "0")}
      </div>
      <div className="text-[15px] leading-relaxed">{text}</div>
      <button
        className="absolute right-3 top-3 rounded p-1.5 text-xs"
        style={{ color: copied ? "var(--green)" : "var(--text-3)" }}
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        aria-label="Copy"
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}

function RoundAccordion({ index, round }: { index: number; round: import("@/server/sessions.server").Round }) {
  const [open, setOpen] = useState(false);
  const ev = round.evaluation;
  return (
    <div className="gp-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[color:var(--surface2)]"
      >
        <div className="flex items-center gap-3 text-sm">
          <span className="mono w-12" style={{ color: "var(--text-3)" }}>R{index + 1}</span>
          <span className="font-medium">{capitalize(round.topic)}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px]"
            style={{
              color: difficultyColor(round.difficulty),
              background: `${difficultyColor(round.difficulty)}1f`,
            }}
          >
            {capitalize(round.difficulty)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="mono rounded px-2 py-0.5 text-sm font-bold"
            style={{ color: scoreToColor(ev.overall), background: `${scoreToColor(ev.overall)}1a` }}
          >
            {ev.overall.toFixed(1)}
          </span>
          <span style={{ color: "var(--text-3)" }}>{open ? "−" : "+"}</span>
        </div>
      </button>
      <div style={{ maxHeight: open ? 800 : 0, transition: "max-height 300ms ease", overflow: "hidden" }}>
        <div className="border-t px-5 py-4 text-sm" style={{ borderColor: "var(--border)" }}>
          <div
            className="rounded-[0_8px_8px_8px] p-3 text-[14px] italic"
            style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)", color: "var(--text-2)" }}
          >
            {round.question}
          </div>
          <div className="mt-3">
            <div className="mono text-[11px] uppercase" style={{ color: "var(--text-3)" }}>Your Answer:</div>
            <div className="mt-1" style={{ color: "var(--text-2)" }}>
              {round.answer.length > 300 ? round.answer.slice(0, 300) + "..." : round.answer}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniBar label="Clarity" v={ev.clarity} />
            <MiniBar label="Tech Depth" v={ev.technical_depth} />
            <MiniBar label="Structure" v={ev.structure} />
            <MiniBar label="Overall" v={ev.overall} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold" style={{ color: "#86efac" }}>Strengths</div>
              <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-2)" }}>
                {ev.strengths?.map((s, i) => <li key={i}>✓ {s}</li>)}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold" style={{ color: "#fca5a5" }}>Weaknesses</div>
              <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-2)" }}>
                {ev.weaknesses?.map((s, i) => <li key={i}>✗ {s}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniBar({ label, v }: { label: string; v: number }) {
  const pct = Math.max(0, Math.min(100, (v / 10) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span style={{ color: "var(--text-3)" }}>{label}</span>
        <span className="mono">{v}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface3)" }}>
        <div className="h-full" style={{ width: `${pct}%`, background: scoreToColor(v) }} />
      </div>
    </div>
  );
}

function CopyReportButton() {
  const state = useAppState();
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!state.report) return;
    const r = state.report;
    const txt = `Mockpilot Debrief — ${r.role} @ ${r.company}
Overall: ${r.overall_score.toFixed(1)}/10  (${r.hire_decision})

STRENGTHS:
${r.strengths.map((s) => `• ${s}`).join("\n")}

WEAKNESSES:
${r.weaknesses.map((s) => `• ${s}`).join("\n")}

PRACTICE:
${r.drill_questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

STUDY PLAN:
${r.study_plan}`;
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button className="gp-btn w-full md:flex-1" onClick={copy}>
      {copied ? "✓ Copied!" : "📋 Copy Report"}
    </button>
  );
}
