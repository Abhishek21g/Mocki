import type { ReactNode } from "react";
import type { SessionSummary } from "./types";
import { fmt } from "./metrics";

/**
 * Top-of-dashboard KPI strip. Five cards, color-coded by metric, dense
 * mono. Auto-wraps via CSS grid when the container is narrow (e.g. inline
 * variant on the interview page).
 */
export function KpiStrip({
  summary,
  totalTurns,
}: {
  summary: SessionSummary;
  /** Expected total turns in this session (e.g. 6). Used in the TURN card. */
  totalTurns: number;
}) {
  const turnText =
    summary.currentTurn === 0
      ? `setup`
      : `${summary.currentTurn} / ${totalTurns || summary.currentTurn}`;

  return (
    <div
      className="grid gap-2 px-3 py-3"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <KpiCard
        label="Last turn"
        value={fmt.ms(summary.lastTurnLatencyMs)}
        sub={fmt.usd(summary.lastTurnCostUsd)}
        accent="#22d3ee"
      />
      <KpiCard
        label="Tokens"
        value={fmt.tokens(summary.totalTokens)}
        sub={`${fmt.tokens(summary.totalInputTokens)} in · ${fmt.tokens(
          summary.totalOutputTokens,
        )} out`}
        accent="#f97316"
      />
      <KpiCard
        label="Session cost"
        value={fmt.usd(summary.totalCostUsd)}
        sub={`${fmt.count(summary.agentCallCount)} call${
          summary.agentCallCount === 1 ? "" : "s"
        }`}
        accent="#76b900"
      />
      <KpiCard
        label="Agents"
        value={fmt.count(summary.agentCount)}
        sub={`distinct · ${fmt.count(summary.agentCallCount)} fired`}
        accent="#a78bfa"
      />
      <KpiCard
        label="Turn"
        value={turnText}
        sub={summary.currentTurn === 0 ? "boot sequence" : "live"}
        accent="#eab308"
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg px-3 py-2"
      style={{
        background: "rgba(0,0,0,0.35)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ background: accent, opacity: 0.7 }}
      />
      <div
        className="mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </div>
      <div
        className="mono text-lg font-bold leading-tight"
        style={{ color: accent }}
      >
        {value}
      </div>
      {sub != null && (
        <div
          className="mono mt-0.5 text-[10px] truncate"
          style={{ color: "var(--text-3)" }}
          title={typeof sub === "string" ? sub : undefined}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
