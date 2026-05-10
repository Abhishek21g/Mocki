import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import {
  capitalize,
  difficultyColor,
  getHireBg,
  getHireColor,
  humanizeLabel,
  initials,
  scoreToColor,
  stageLabel,
} from "@/lib/ghost-utils";
import { fetchPublicReport } from "@/server/public-report.functions";
import type { InterviewSessionPayload } from "@/server/history.server";
import { useTrack } from "@/lib/use-track";

export const Route = createFileRoute("/report/$sessionId")({
  head: () => ({
    meta: [{ title: "Shared Debrief · Mocki" }],
  }),
  component: PublicReportPage,
});

function PublicReportPage() {
  const { sessionId } = Route.useParams();
  const [report, setReport] = useState<InterviewSessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const track = useTrack();

  useEffect(() => {
    fetchPublicReport({ data: { sessionId } })
      .then((res) => {
        if (res.ok && res.payload) {
          setReport(res.payload);
          track("report_viewed", { session_id: sessionId });
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="grid-bg flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
          <span className="gp-spinner" /> Loading report…
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="grid-bg flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-bold">Report not found</h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          This link may have expired or the session was deleted.
        </p>
        <Link to="/" className="gp-btn">
          Try Mocki →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid-bg min-h-screen pb-24">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8">
        <HomeLogo className="text-base" />
        <div className="mono text-xs flex items-center gap-3">
          <span style={{ color: "var(--text-3)" }}>SHARED DEBRIEF</span>
          <Link
            to="/"
            className="rounded-full border px-3 py-1 text-xs font-semibold transition hover:text-white"
            style={{ borderColor: "rgba(118,185,0,0.4)", color: "var(--green)", background: "rgba(118,185,0,0.08)" }}
          >
            Try Mocki →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-12">
        <Hero
          score={report.overall_score}
          decision={report.hire_decision}
          role={report.role}
          company={report.company}
          totalRounds={report.totalRounds}
        />

        <PanelSummary interviewers={report.interviewers} />

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          <ColumnCard title="Strengths" color="#76b900" icon="✓" items={report.strengths} itemColor="#76b900" />
          <ColumnCard title="Weaknesses" color="#ef4444" icon="✗" items={report.weaknesses} itemColor="#fca5a5" />
          <ColumnCard
            title="Focus Areas"
            color="#eab308"
            icon="🎯"
            items={Array.from(
              new Set(report.rounds.flatMap((r) => r.evaluation.missed_concepts || [])),
            ).slice(0, 5)}
            itemColor="#fde68a"
          />
        </div>

        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">🎯 Practice These Next</h2>
          <div className="flex flex-col gap-3">
            {report.drill_questions.map((q, i) => (
              <DrillCard key={i} index={i + 1} text={q} />
            ))}
          </div>
        </section>

        <section className="mt-12 gp-card p-7 md:p-8">
          <h2 className="mb-3 text-xl font-bold">📋 Personal Study Plan</h2>
          <p className="text-[15px] leading-[1.8]" style={{ color: "var(--text-2)" }}>
            {report.study_plan}
          </p>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">Session Breakdown</h2>
          <div className="flex flex-col gap-2">
            {report.rounds.map((round, i) => (
              <RoundAccordion key={i} index={i} round={round} roleProfile={report.roleProfile} />
            ))}
          </div>
        </section>

        <div className="mt-12 text-center">
          <Link to="/" className="gp-btn px-8">
            Run your own interview →
          </Link>
          <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>
            Powered by NVIDIA Nemotron · Built at BeaverHacks 2026
          </p>
        </div>
      </main>
    </div>
  );
}

function Hero({ score, decision, role, company, totalRounds }: {
  score: number; decision: string; role: string; company: string; totalRounds: number;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      setShown(score * (0.5 - 0.5 * Math.cos(Math.PI * progress)));
      if (progress < 1) raf = requestAnimationFrame(tick);
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
          style={{ background: getHireBg(decision), color: getHireColor(decision), border: `1px solid ${getHireColor(decision)}` }}
        >
          {decision}
        </span>
      </div>
      <div className="mt-4 text-sm" style={{ color: "var(--text-2)" }}>
        Based on {totalRounds} interview turns · {role} @ {company}
      </div>
    </div>
  );
}

function PanelSummary({ interviewers }: { interviewers: import("@/server/sessions.server").Persona[] }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-lg font-semibold">Panel Lineup</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {interviewers.map((iv) => (
          <div key={iv.id} className="gp-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-black"
                style={{ background: "linear-gradient(135deg, var(--green), #4d7a00)" }}>
                {initials(iv.name)}
              </div>
              <div>
                <div className="font-semibold">{iv.name}</div>
                <div className="text-sm" style={{ color: "var(--text-2)" }}>{iv.title}</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--surface2)", color: "var(--text-2)" }}>
              {iv.focus}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ColumnCard({ title, color, icon, items, itemColor }: {
  title: string; color: string; icon: string; items: string[]; itemColor: string;
}) {
  return (
    <div className="gp-card p-6" style={{ borderTop: `2px solid ${color}` }}>
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <span style={{ color }}>{icon}</span>{title}
      </div>
      <ul className="flex flex-col gap-2 text-sm" style={{ color: "var(--text-2)" }}>
        {items.length === 0 && <li style={{ color: "var(--text-3)" }}>—</li>}
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span style={{ color: itemColor }}>{icon}</span><span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DrillCard({ index, text }: { index: number; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-[0_12px_12px_12px] p-5 pr-12"
      style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}>
      <div className="mono mb-2 text-xs font-bold" style={{ color: "var(--green)" }}>
        {String(index).padStart(2, "0")}
      </div>
      <div className="text-[15px] leading-relaxed">{text}</div>
      <button
        className="absolute right-3 top-3 rounded p-1.5 text-xs"
        style={{ color: copied ? "var(--green)" : "var(--text-3)" }}
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}

function RoundAccordion({ index, round, roleProfile }: {
  index: number;
  round: import("@/server/sessions.server").Round;
  roleProfile: import("@/server/sessions.server").RoleProfile;
}) {
  const [open, setOpen] = useState(false);
  const ev = round.evaluation;
  return (
    <div className="gp-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[color:var(--surface2)]"
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="mono w-12" style={{ color: "var(--text-3)" }}>R{index + 1}</span>
          <span className="font-medium">{round.interviewerName}</span>
          <span style={{ color: "var(--text-3)" }}>·</span>
          <span className="font-medium">{round.topic}</span>
          <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--surface3)", color: "var(--text-2)" }}>
            {stageLabel(round.stage)}
          </span>
          <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--surface3)", color: "var(--text-2)" }}>
            {humanizeLabel(round.turnType)}
          </span>
          <span className="rounded-full px-2 py-0.5 text-[11px]"
            style={{ color: difficultyColor(round.difficulty), background: `${difficultyColor(round.difficulty)}1f` }}>
            {capitalize(round.difficulty)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono rounded px-2 py-0.5 text-sm font-bold"
            style={{ color: scoreToColor(ev.overall), background: `${scoreToColor(ev.overall)}1a` }}>
            {ev.overall.toFixed(1)}
          </span>
          <span style={{ color: "var(--text-3)" }}>{open ? "−" : "+"}</span>
        </div>
      </button>
      <div style={{ maxHeight: open ? 900 : 0, transition: "max-height 300ms ease", overflow: "hidden" }}>
        <div className="border-t px-5 py-4 text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="rounded-[0_8px_8px_8px] p-3" style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}>
            <div className="mono text-[11px] uppercase" style={{ color: "var(--text-3)" }}>Question</div>
            <div className="mt-1 italic" style={{ color: "var(--text-2)" }}>{round.question}</div>
          </div>
          <div className="mt-3 rounded-[0_8px_8px_8px] p-3" style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}>
            <div className="mono text-[11px] uppercase" style={{ color: "var(--text-3)" }}>Evaluator Summary</div>
            <div className="mt-1" style={{ color: "var(--text-2)" }}>{ev.answer_summary}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniBar label="Clarity" value={ev.clarity} />
            <MiniBar label={ev.middle_label ?? "Tech Depth"} value={ev.technical_depth} />
            <MiniBar label="Structure" value={ev.structure} />
            <MiniBar label="Overall" value={ev.overall} />
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
                {ev.weaknesses?.map((w, i) => <li key={i}>✗ {w}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 10) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span style={{ color: "var(--text-3)" }}>{label}</span>
        <span className="mono">{value}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface3)" }}>
        <div className="h-full" style={{ width: `${pct}%`, background: scoreToColor(value) }} />
      </div>
    </div>
  );
}
