import type { ReactNode } from "react";
import type { ViewerSession } from "./types";

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  easy: { bg: "rgba(59,130,246,0.18)", text: "#93c5fd" },
  medium: { bg: "rgba(234,179,8,0.18)", text: "#fbbf24" },
  hard: { bg: "rgba(248,113,113,0.18)", text: "#f87171" },
};

export function ControlRoomHeader({ session }: { session: ViewerSession | null }) {
  if (!session) {
    return (
      <div
        className="px-4 py-4"
        style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.2)" }}
      >
        <p
          className="mono text-center text-[11px] uppercase tracking-wider"
          style={{ color: "var(--text-3)" }}
        >
          Waiting for session data…
        </p>
      </div>
    );
  }

  const activeInterviewer =
    session.interviewers.find((i) => i.id === session.activeInterviewerId) ??
    session.interviewers[0] ??
    null;

  const diff = session.currentDifficulty?.toLowerCase() ?? "";
  const diffStyle = DIFFICULTY_COLORS[diff] ?? DIFFICULTY_COLORS.medium;

  const reason = session.currentCoordinatorReason ?? "";
  const truncatedReason = reason.length > 120 ? reason.slice(0, 117) + "…" : reason;

  return (
    <div
      className="grid gap-3 px-4 py-4"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        borderBottom: "1px solid var(--border)",
        background: "rgba(0,0,0,0.2)",
      }}
    >
      <StatusCard label="Current Interviewer">
        {activeInterviewer ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
              {activeInterviewer.name}
            </span>
            <span className="mono text-[10px]" style={{ color: "var(--text-3)" }}>
              {activeInterviewer.title}
            </span>
            <span
              className="mt-1 truncate text-[11px]"
              style={{ color: "var(--text-2)" }}
              title={activeInterviewer.personality}
            >
              {activeInterviewer.personality}
            </span>
          </div>
        ) : (
          <Dash />
        )}
      </StatusCard>

      <StatusCard label="Evaluating">
        {session.currentStage ? (
          <div className="flex flex-col gap-1">
            <span
              className="text-sm font-bold capitalize"
              style={{ color: "#a78bfa" }}
            >
              {session.currentStage.replace(/_/g, " ")}
            </span>
            {session.currentTurnType && (
              <span
                className="mono text-[10px] capitalize"
                style={{ color: "var(--text-3)" }}
              >
                {session.currentTurnType.replace(/_/g, " ")}
              </span>
            )}
          </div>
        ) : (
          <Dash />
        )}
      </StatusCard>

      <StatusCard label="Last Decision">
        {truncatedReason ? (
          <span
            className="text-[11px] leading-relaxed"
            style={{ color: "var(--text-2)" }}
            title={reason}
          >
            {truncatedReason}
          </span>
        ) : (
          <Dash />
        )}
      </StatusCard>

      <StatusCard label="Next Focus">
        {session.currentFocus ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--text-2)" }}>
              {session.currentFocus}
            </span>
            {diff && (
              <span
                className="mono inline-block self-start rounded-sm px-1.5 py-[1px] text-[9px] uppercase tracking-wider"
                style={{ background: diffStyle.bg, color: diffStyle.text }}
              >
                {diff}
              </span>
            )}
          </div>
        ) : (
          <Dash />
        )}
      </StatusCard>
    </div>
  );
}

function StatusCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg px-3 py-2.5"
      style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid var(--border)",
        minHeight: 80,
      }}
    >
      <span
        className="mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Dash() {
  return (
    <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
      —
    </span>
  );
}
