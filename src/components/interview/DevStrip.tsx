import { humanizeLabel, stageLabel } from "@/lib/ghost-utils";
import type { InterviewStage, Persona, TurnType } from "@/server/sessions.server";

export function FlowBadge({ label, value, accent }: { label: string; value: string; accent: string }) {
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

export function FlowCard({
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

export function SessionStrip({
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
