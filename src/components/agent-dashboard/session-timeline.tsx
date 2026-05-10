import { useState } from "react";
import type { ViewerRound, ViewerSession } from "./types";

export function SessionTimeline({ session }: { session: ViewerSession | null }) {
  if (!session || session.rounds.length === 0) {
    return (
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <p
          className="mono text-[11px] uppercase tracking-wider"
          style={{ color: "var(--text-3)" }}
        >
          No completed rounds yet
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-y-auto"
      style={{
        borderBottom: "1px solid var(--border)",
        maxHeight: 280,
      }}
    >
      <div
        className="mono sticky top-0 px-4 py-2 text-[9px] uppercase tracking-[0.14em]"
        style={{
          color: "var(--text-3)",
          borderBottom: "1px solid var(--border)",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}
      >
        Session Timeline · {session.rounds.length} / {session.totalRounds} rounds
      </div>
      {session.rounds.map((round, i) => (
        <RoundRow key={round.id} round={round} index={i} />
      ))}
    </div>
  );
}

function RoundRow({ round, index }: { round: ViewerRound; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const score = round.evaluation?.overall ?? null;
  const scoreColor =
    score == null
      ? "var(--text-3)"
      : score >= 7
        ? "var(--green)"
        : score >= 5
          ? "#fbbf24"
          : "#f87171";

  const shortQuestion =
    round.question.length > 100
      ? round.question.slice(0, 97) + "…"
      : round.question;

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)]"
      >
        <span
          className="mono mt-0.5 shrink-0 rounded-sm px-1.5 py-[2px] text-[9px] uppercase tracking-wider"
          style={{
            background: "rgba(118,185,0,0.12)",
            color: "var(--green)",
            minWidth: 36,
            textAlign: "center",
          }}
        >
          T{index + 1}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="mono text-[10px]" style={{ color: "var(--text-3)" }}>
              {round.interviewerName}
            </span>
            <span
              className="mono text-[9px] uppercase tracking-wider"
              style={{ color: "rgba(148,163,184,0.5)" }}
            >
              · {round.stage.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-2)" }}>
            {expanded ? round.question : shortQuestion}
          </p>
        </div>

        {score != null && (
          <span
            className="mono shrink-0 rounded-sm px-1.5 py-[2px] text-[11px] font-bold"
            style={{
              color: scoreColor,
              background: `${scoreColor}22`,
              border: `1px solid ${scoreColor}44`,
              minWidth: 28,
              textAlign: "center",
            }}
          >
            {score}
          </span>
        )}
      </button>

      {expanded && round.evaluation?.answer_summary && (
        <div className="px-4 pb-3" style={{ paddingLeft: "calc(1rem + 36px + 0.75rem)" }}>
          <p
            className="text-[11px] italic leading-relaxed"
            style={{ color: "var(--text-3)" }}
          >
            {round.evaluation.answer_summary}
          </p>
          {(round.evaluation.strengths.length > 0 ||
            round.evaluation.weaknesses.length > 0) && (
            <div className="mt-2 flex gap-6">
              <ul className="flex flex-col gap-0.5">
                {round.evaluation.strengths.slice(0, 2).map((s, i) => (
                  <li key={i} className="mono text-[10px]" style={{ color: "var(--green)" }}>
                    + {s}
                  </li>
                ))}
              </ul>
              <ul className="flex flex-col gap-0.5">
                {round.evaluation.weaknesses.slice(0, 2).map((w, i) => (
                  <li key={i} className="mono text-[10px]" style={{ color: "#f87171" }}>
                    − {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
