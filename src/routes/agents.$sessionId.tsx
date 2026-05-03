import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { AgentDashboard } from "@/components/agent-dashboard";
import type { AgentEvent } from "@/components/agent-dashboard/types";
import { fetchAgentLogs } from "@/server/interview.functions";

type AgentsSearch = {
  /** Total turns the panel was configured for. Threads through the popout
   * link so the KPI strip's "Turn n / N" denominator stays accurate even
   * when the standalone page is opened in a fresh tab without app state. */
  totalTurns?: number;
};

export const Route = createFileRoute("/agents/$sessionId")({
  head: () => ({
    meta: [{ title: "Agent Mission Control · Mocki" }],
  }),
  validateSearch: (raw: Record<string, unknown>): AgentsSearch => {
    const t = raw.totalTurns;
    const totalTurns =
      typeof t === "number" && Number.isFinite(t) && t > 0
        ? Math.floor(t)
        : typeof t === "string" && /^\d+$/.test(t)
          ? Number(t)
          : undefined;
    return { totalTurns };
  },
  component: AgentsStandalonePage,
});

function AgentsStandalonePage() {
  const { sessionId } = Route.useParams();
  const { totalTurns: searchTotalTurns } = Route.useSearch();

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [polling, setPolling] = useState<"connecting" | "live" | "stalled">(
    "connecting",
  );
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const sinceRef = useRef<number>(0);

  // Poll the same agent log endpoint the inline drawer uses; identical 800ms
  // cadence so judges watching one tab vs. the other see the same numbers.
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;

    const tick = async () => {
      try {
        const res = await fetchAgentLogs({
          data: { sessionId, since: sinceRef.current },
        });
        if (!alive) return;
        if (res.events.length) {
          sinceRef.current = res.events[res.events.length - 1].ts;
          setEvents((prev) =>
            [...prev, ...(res.events as AgentEvent[])].slice(-500),
          );
        }
        setPolling("live");
        setLastPollAt(Date.now());
      } catch {
        if (alive) setPolling("stalled");
      }
    };

    void tick();
    const id = setInterval(tick, 800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sessionId]);

  // Total turns: prefer the search param (popout from /interview) and fall
  // back to "highest turn observed" so the page works even when opened
  // directly from a URL the user pasted in.
  const totalTurns = useMemo(() => {
    if (searchTotalTurns && searchTotalTurns > 0) return searchTotalTurns;
    let max = 0;
    for (const e of events) {
      if (typeof e.turn === "number" && e.turn > max) max = e.turn;
    }
    return Math.max(max, 1);
  }, [searchTotalTurns, events]);

  return (
    <div className="grid-bg flex min-h-screen flex-col">
      {/* Page chrome */}
      <header
        className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-6 pt-6 pb-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-4">
          <HomeLogo className="text-base" />
          <div className="hidden flex-col gap-0.5 sm:flex">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold">Mission Control</span>
              <span
                className="mono rounded-sm px-1.5 py-[1px] text-[9px] uppercase tracking-wider"
                style={{
                  background: "rgba(118,185,0,0.15)",
                  color: "var(--green)",
                }}
              >
                multi-agent
              </span>
            </div>
            <div
              className="mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--text-3)" }}
            >
              session · {sessionId}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusPill state={polling} lastPollAt={lastPollAt} />
          <Link
            to="/interview"
            className="mono rounded border px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-2)",
              background: "rgba(0,0,0,0.4)",
            }}
          >
            ← back to interview
          </Link>
        </div>
      </header>

      {/* Dashboard surface */}
      <main className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-6 pt-4 pb-8">
        <section
          className="flex flex-1 flex-col overflow-hidden rounded-2xl border"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <AgentDashboard
            events={events}
            totalTurns={totalTurns}
            variant="standalone"
          />
        </section>

        {events.length === 0 && polling === "live" && (
          <p
            className="mono mt-3 text-center text-[11px]"
            style={{ color: "var(--text-3)" }}
          >
            Connected to session, waiting for the first agent event…
          </p>
        )}
      </main>
    </div>
  );
}

function StatusPill({
  state,
  lastPollAt,
}: {
  state: "connecting" | "live" | "stalled";
  lastPollAt: number | null;
}) {
  const style =
    state === "live"
      ? { dot: "var(--green)", fg: "var(--green)", label: "LIVE" }
      : state === "stalled"
        ? { dot: "#fbbf24", fg: "#fbbf24", label: "STALLED" }
        : { dot: "#94a3b8", fg: "#94a3b8", label: "CONNECTING" };

  // Live "now" cursor for the age label. Held in state (initialized null) so
  // the SSR pass and first client paint agree; ticks every second on the
  // client to keep the "Xs ago" pill in sync between polls.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ageLabel = useMemo(() => {
    if (!lastPollAt || now == null) return "";
    const ageSec = Math.max(0, Math.floor((now - lastPollAt) / 1000));
    if (ageSec < 2) return "just now";
    return `${ageSec}s ago`;
  }, [lastPollAt, now]);

  return (
    <div
      className="mono flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider"
      style={{
        borderColor: "var(--border)",
        background: "rgba(0,0,0,0.4)",
        color: style.fg,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: style.dot,
          animation: state === "live" ? "bounce-dot 1.2s infinite" : undefined,
        }}
      />
      <span>{style.label}</span>
      {ageLabel && (
        <span style={{ color: "var(--text-3)", marginLeft: 4 }}>· {ageLabel}</span>
      )}
    </div>
  );
}
