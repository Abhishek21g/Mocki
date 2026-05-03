import { useMemo } from "react";
import { AgentBreakdown } from "./agent-breakdown";
import { agentColor } from "./agent-registry";
import { EventStream } from "./event-stream";
import { KpiStrip } from "./kpi-strip";
import { summarizeSession } from "./metrics";
import { TurnWaterfall } from "./turn-waterfall";
import type { AgentEvent } from "./types";

export { agentColor };

export type AgentDashboardVariant = "inline" | "drawer" | "standalone";

/**
 * Composed observability dashboard for the multi-agent system. Renders a
 * KPI strip up top, slots for the waterfall (Phase 4) and breakdown
 * (Phase 5), and the live event stream below.
 *
 * No internal data fetching — the parent passes the polled events array.
 * That keeps the component pure-render and easy to drop into any route
 * (current: drawer on `/interview`; later: standalone `/agents/$id`).
 */
export function AgentDashboard({
  events,
  totalTurns = 6,
  variant = "inline",
}: {
  events: AgentEvent[];
  totalTurns?: number;
  variant?: AgentDashboardVariant;
}) {
  const summary = useMemo(() => summarizeSession(events), [events]);

  return (
    <div className="flex h-full flex-col">
      <KpiStrip summary={summary} totalTurns={totalTurns} />
      <TurnWaterfall events={events} />
      <AgentBreakdown events={events} />
      <EventStream events={events} variant={variant} />
    </div>
  );
}
