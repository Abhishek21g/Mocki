import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { store, useAppState } from "@/lib/ghost-store";
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

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [{ title: "Debrief Report · Mocki" }],
  }),
  component: ReportPage,
});

function ReportPage() {
  const state = useAppState();
  const nav = useNavigate();
  if (!state.report) return <Navigate to="/" />;
  const report = state.report;

  return (
    <div className="grid-bg min-h-screen pb-24">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8">
        <HomeLogo className="text-base" />
        <div className="mono text-xs" style={{ color: "var(--text-3)" }}>
          PANEL DEBRIEF
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
          <ColumnCard
            title="Strengths"
            color="#76b900"
            icon="✓"
            items={report.strengths}
            itemColor="#76b900"
          />
          <ColumnCard
            title="Weaknesses"
            color="#ef4444"
            icon="✗"
            items={report.weaknesses}
            itemColor="#fca5a5"
          />
          <ColumnCard
            title="Focus Areas"
            color="#eab308"
            icon="🎯"
            items={Array.from(
              new Set(report.rounds.flatMap((round) => round.evaluation.missed_concepts || [])),
            ).slice(0, 5)}
            itemColor="#fde68a"
          />
        </div>

        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">🎯 Practice These Next</h2>
          <div className="flex flex-col gap-3">
            {report.drill_questions.map((question, index) => (
              <DrillCard key={index} index={index + 1} text={question} />
            ))}
          </div>
        </section>

        <section className="mt-12 gp-card p-7 md:p-8">
          <h2 className="mb-3 text-xl font-bold">📋 Your Personal Study Plan</h2>
          <p className="text-[15px] leading-[1.8]" style={{ color: "var(--text-2)" }}>
            {report.study_plan}
          </p>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">Session Breakdown</h2>
          <div className="flex flex-col gap-2">
            {report.rounds.map((round, index) => (
              <RoundAccordion
                key={index}
                index={index}
                round={round}
                roleProfile={report.roleProfile}
              />
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

function Hero({
  score,
  decision,
  role,
  company,
  totalRounds,
}: {
  score: number;
  decision: string;
  role: string;
  company: string;
  totalRounds: number;
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
        <span
          className="mono text-7xl font-extrabold leading-none md:text-8xl"
          style={{ color: "var(--green)" }}
        >
          {shown.toFixed(1)}
        </span>
        <span className="mono pb-2 text-3xl" style={{ color: "var(--text-3)" }}>
          /10
        </span>
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
        Based on {totalRounds} interview turns · {role} @ {company}
      </div>
    </div>
  );
}

function PanelSummary({
  interviewers,
}: {
  interviewers: import("@/server/sessions.server").Persona[];
}) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-lg font-semibold">Panel Lineup</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {interviewers.map((interviewer) => (
          <div key={interviewer.id} className="gp-card p-5">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-black"
                style={{ background: "linear-gradient(135deg, var(--green), #4d7a00)" }}
              >
                {initials(interviewer.name)}
              </div>
              <div>
                <div className="font-semibold">{interviewer.name}</div>
                <div className="text-sm" style={{ color: "var(--text-2)" }}>
                  {interviewer.title}
                </div>
              </div>
            </div>
            <div
              className="mt-3 rounded-xl px-3 py-2 text-xs"
              style={{ background: "var(--surface2)", color: "var(--text-2)" }}
            >
              {interviewer.focus}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ColumnCard({
  title,
  color,
  icon,
  items,
  itemColor,
}: {
  title: string;
  color: string;
  icon: string;
  items: string[];
  itemColor: string;
}) {
  return (
    <div className="gp-card p-6" style={{ borderTop: `2px solid ${color}` }}>
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <span style={{ color }}>{icon}</span>
        {title}
      </div>
      <ul className="flex flex-col gap-2 text-sm" style={{ color: "var(--text-2)" }}>
        {items.length === 0 && <li style={{ color: "var(--text-3)" }}>—</li>}
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span style={{ color: itemColor }}>{icon}</span>
            <span>{item}</span>
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

function RoundAccordion({
  index,
  round,
  roleProfile,
}: {
  index: number;
  round: import("@/server/sessions.server").Round;
  roleProfile: import("@/server/sessions.server").RoleProfile;
}) {
  const [open, setOpen] = useState(false);
  const evaluation = round.evaluation;

  return (
    <div className="gp-card overflow-hidden">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[color:var(--surface2)]"
      >
        <div className="flex items-center gap-3 text-sm">
          <span className="mono w-12" style={{ color: "var(--text-3)" }}>
            R{index + 1}
          </span>
          <span className="font-medium">{round.interviewerName}</span>
          <span style={{ color: "var(--text-3)" }}>·</span>
          <span className="font-medium">{round.topic}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px]"
            style={{ background: "var(--surface3)", color: "var(--text-2)" }}
          >
            {stageLabel(round.stage)}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px]"
            style={{ background: "var(--surface3)", color: "var(--text-2)" }}
          >
            {humanizeLabel(round.turnType)}
          </span>
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
            style={{
              color: scoreToColor(evaluation.overall),
              background: `${scoreToColor(evaluation.overall)}1a`,
            }}
          >
            {evaluation.overall.toFixed(1)}
          </span>
          <span style={{ color: "var(--text-3)" }}>{open ? "−" : "+"}</span>
        </div>
      </button>
      <div
        style={{
          maxHeight: open ? 900 : 0,
          transition: "max-height 300ms ease",
          overflow: "hidden",
        }}
      >
        <div className="border-t px-5 py-4 text-sm" style={{ borderColor: "var(--border)" }}>
          <div
            className="rounded-[0_8px_8px_8px] p-3 text-[14px]"
            style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}
          >
            <div className="mono text-[11px] uppercase" style={{ color: "var(--text-3)" }}>
              Coordinator rationale
            </div>
            <div className="mt-1 italic" style={{ color: "var(--text-2)" }}>
              {round.coordinatorReason}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <MetaBlock label="Turn Goal" value={round.goal} />
            <MetaBlock
              label="Personalization"
              value={`${round.basedOnResume ? `Resume: ${round.basedOnResume}` : "Resume: none"}${
                round.basedOnJobRequirement
                  ? `\nJob: ${round.basedOnJobRequirement}`
                  : "\nJob: none"
              }`}
            />
          </div>
          <div
            className="mt-3 rounded-[0_8px_8px_8px] p-3 text-[14px] italic"
            style={{
              background: "var(--surface2)",
              borderLeft: "3px solid var(--green)",
              color: "var(--text-2)",
            }}
          >
            {round.question}
          </div>
          <div className="mt-3">
            <div className="mono text-[11px] uppercase" style={{ color: "var(--text-3)" }}>
              Your Answer
            </div>
            <div className="mt-1" style={{ color: "var(--text-2)" }}>
              {round.answer.length > 400 ? `${round.answer.slice(0, 400)}...` : round.answer}
            </div>
          </div>
          <div
            className="mt-3 rounded-[0_8px_8px_8px] p-3 text-[14px]"
            style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}
          >
            <div className="mono text-[11px] uppercase" style={{ color: "var(--text-3)" }}>
              Evaluator Summary
            </div>
            <div className="mt-1" style={{ color: "var(--text-2)" }}>
              {round.evaluation.answer_summary}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniBar label="Clarity" value={evaluation.clarity} />
            <MiniBar label={evaluation.middle_label ?? "Tech Depth"} value={evaluation.technical_depth} />
            <MiniBar label="Structure" value={evaluation.structure} />
            <MiniBar label="Overall" value={evaluation.overall} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <MetaBlock label="Resume Alignment" value={evaluation.resume_alignment} />
            <MetaBlock label="Job Alignment" value={evaluation.job_requirement_alignment} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold" style={{ color: "#86efac" }}>
                Strengths
              </div>
              <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-2)" }}>
                {evaluation.strengths?.map((strength, itemIndex) => (
                  <li key={itemIndex}>✓ {strength}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold" style={{ color: "#fca5a5" }}>
                Weaknesses
              </div>
              <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-2)" }}>
                {evaluation.weaknesses?.map((weakness, itemIndex) => (
                  <li key={itemIndex}>✗ {weakness}</li>
                ))}
              </ul>
            </div>
          </div>
          {evaluation.unresolved_follow_ups?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {evaluation.unresolved_follow_ups.map((probe, probeIndex) => (
                <span
                  key={probeIndex}
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
      </div>
    </div>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface2)" }}>
      <div className="mono text-[11px] uppercase" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--text-2)" }}>
        {value}
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
      <div
        className="h-1 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface3)" }}
      >
        <div className="h-full" style={{ width: `${pct}%`, background: scoreToColor(value) }} />
      </div>
    </div>
  );
}

function CopyReportButton() {
  const state = useAppState();
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!state.report) return;
    const report = state.report;
    const text = `Mocki Debrief — ${report.role} @ ${report.company}
Overall: ${report.overall_score.toFixed(1)}/10 (${report.hire_decision})

PANEL:
${report.interviewers.map((interviewer) => `• ${interviewer.name} — ${interviewer.title}`).join("\n")}

STRENGTHS:
${report.strengths.map((item) => `• ${item}`).join("\n")}

WEAKNESSES:
${report.weaknesses.map((item) => `• ${item}`).join("\n")}

PRACTICE:
${report.drill_questions.map((question, index) => `${index + 1}. ${question}`).join("\n")}

STUDY PLAN:
${report.study_plan}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button className="gp-btn w-full md:flex-1" onClick={copy}>
      {copied ? "✓ Copied!" : "📋 Copy Report"}
    </button>
  );
}
