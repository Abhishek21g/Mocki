import { useMemo, useState } from "react";
import { AgentBreakdown } from "./agent-breakdown";
import { agentColor } from "./agent-registry";
import { ControlRoomHeader } from "./control-room-header";
import { EventStream } from "./event-stream";
import { KpiStrip } from "./kpi-strip";
import { summarizeSession } from "./metrics";
import { SessionTimeline } from "./session-timeline";
import { TurnWaterfall } from "./turn-waterfall";
import type { AgentEvent, ViewerSession } from "./types";

export { agentColor };

export type AgentDashboardVariant = "inline" | "drawer" | "standalone";

/**
 * Composed observability dashboard for the multi-agent system.
 *
 * Top section: live status cards + session timeline (always visible).
 * Below: raw debug metrics (KPI strip, waterfall, agent breakdown) hidden
 * behind a toggle so the control room view stays clean by default.
 * Bottom: live event stream (always visible).
 */
export function AgentDashboard({
  events,
  totalTurns = 6,
  variant = "inline",
  session,
}: {
  events: AgentEvent[];
  totalTurns?: number;
  variant?: AgentDashboardVariant;
  session?: ViewerSession | null;
}) {
  const summary = useMemo(() => summarizeSession(events), [events]);
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <ControlRoomHeader session={session ?? null} />
      <SessionTimeline session={session ?? null} />

      {/* Debug metrics toggle */}
      <div
        className="flex items-center justify-end px-3 py-1.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          type="button"
          onClick={() => setShowDebug((v) => !v)}
          className="mono rounded border px-2 py-0.5 text-[9px] uppercase tracking-wider transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          style={{
            borderColor: showDebug ? "var(--green)" : "var(--border)",
            color: showDebug ? "var(--green)" : "var(--text-3)",
            background: "rgba(0,0,0,0.4)",
          }}
        >
          {showDebug ? "▾" : "▸"} debug metrics
        </button>
      </div>

      {showDebug && (
        <>
          <KpiStrip summary={summary} totalTurns={totalTurns} />
          <TurnWaterfall events={events} />
          <AgentBreakdown events={events} />
        </>
      )}

      {showDebug && <EventStream events={events} variant={variant} />}
    </div>
  );
}
