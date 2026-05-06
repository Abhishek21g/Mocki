import { useEffect, useState } from "react";
import { scoreToColor, stageLabel } from "@/lib/ghost-utils";
import type { InterviewStage, RoleProfile } from "@/server/sessions.server";

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

export function EvaluationCard({
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
