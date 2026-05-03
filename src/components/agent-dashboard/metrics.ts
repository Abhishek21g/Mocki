import type {
  AgentEvent,
  AgentSpan,
  AgentSummary,
  SessionSummary,
  TurnGroup,
} from "./types";

/**
 * Pair `start` events with their matching `end` / `error` event via
 * `corrId`. Returns one span per logical Nemotron call. Unmatched starts
 * (still running) become `running` spans with no `endTs`.
 *
 * Pure: same input → same output, no side effects, no DOM.
 */
export function pairStartEnd(events: AgentEvent[]): AgentSpan[] {
  const startsByCorrId = new Map<string, AgentEvent>();
  for (const ev of events) {
    if (ev.phase === "start" && ev.corrId) {
      startsByCorrId.set(ev.corrId, ev);
    }
  }

  const spans: AgentSpan[] = [];
  const matchedCorrIds = new Set<string>();
  for (const ev of events) {
    if ((ev.phase !== "end" && ev.phase !== "error") || !ev.corrId) continue;
    const start = startsByCorrId.get(ev.corrId);
    if (!start) continue;
    matchedCorrIds.add(ev.corrId);
    spans.push({
      corrId: ev.corrId,
      agent: ev.agent,
      startTs: start.ts,
      endTs: ev.ts,
      latencyMs: ev.latencyMs ?? ev.ts - start.ts,
      inputTokens: ev.inputTokens,
      outputTokens: ev.outputTokens,
      costUsd: ev.costUsd,
      model: ev.model ?? start.model,
      status: ev.phase === "end" ? "ok" : "error",
      turn: ev.turn ?? start.turn ?? 0,
    });
  }

  for (const [corrId, start] of startsByCorrId) {
    if (matchedCorrIds.has(corrId)) continue;
    spans.push({
      corrId,
      agent: start.agent,
      startTs: start.ts,
      model: start.model,
      status: "running",
      turn: start.turn ?? 0,
    });
  }

  spans.sort((a, b) => a.startTs - b.startTs);
  return spans;
}

/**
 * Compute session-level KPIs from the event stream. All sums use only
 * completed (`end`) events, so token/cost numbers stay accurate even when
 * a call is still in flight.
 */
export function summarizeSession(events: AgentEvent[]): SessionSummary {
  const agents = new Set<string>();
  let totalLatencyMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let agentCallCount = 0;
  let maxTurn = 0;

  for (const ev of events) {
    agents.add(ev.agent);
    if (typeof ev.turn === "number" && ev.turn > maxTurn) maxTurn = ev.turn;
    if (ev.phase !== "end") continue;
    agentCallCount += 1;
    totalLatencyMs += ev.latencyMs ?? 0;
    totalInputTokens += ev.inputTokens ?? 0;
    totalOutputTokens += ev.outputTokens ?? 0;
    totalCostUsd += ev.costUsd ?? 0;
  }

  let lastTurnLatencyMs = 0;
  let lastTurnCostUsd = 0;
  for (const ev of events) {
    if (ev.phase !== "end") continue;
    if ((ev.turn ?? 0) !== maxTurn) continue;
    lastTurnLatencyMs += ev.latencyMs ?? 0;
    lastTurnCostUsd += ev.costUsd ?? 0;
  }

  // Distinct turn count (excluding turn 0 setup), capped to currentTurn.
  const distinctTurns = new Set<number>();
  for (const ev of events) {
    if (typeof ev.turn === "number" && ev.turn > 0) distinctTurns.add(ev.turn);
  }

  return {
    totalLatencyMs,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCostUsd,
    agentCount: agents.size,
    agentCallCount,
    currentTurn: maxTurn,
    totalTurns: distinctTurns.size,
    lastTurnLatencyMs,
    lastTurnCostUsd,
  };
}

/**
 * Per-agent aggregations: how many calls, average/total latency, tokens,
 * cost, and error count. Used by the breakdown table (Phase 5).
 */
export function summarizeAgents(events: AgentEvent[]): AgentSummary[] {
  const map = new Map<string, AgentSummary>();
  const get = (agent: string): AgentSummary => {
    let s = map.get(agent);
    if (!s) {
      s = {
        agent,
        callCount: 0,
        eventCount: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        errorCount: 0,
      };
      map.set(agent, s);
    }
    return s;
  };

  for (const ev of events) {
    const s = get(ev.agent);
    s.eventCount += 1;
    if (ev.phase === "error") s.errorCount += 1;
    if (ev.phase !== "end") continue;
    s.callCount += 1;
    s.totalLatencyMs += ev.latencyMs ?? 0;
    s.totalInputTokens += ev.inputTokens ?? 0;
    s.totalOutputTokens += ev.outputTokens ?? 0;
    s.totalCostUsd += ev.costUsd ?? 0;
  }

  for (const s of map.values()) {
    s.avgLatencyMs = s.callCount > 0 ? s.totalLatencyMs / s.callCount : 0;
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalCostUsd - a.totalCostUsd || b.callCount - a.callCount,
  );
}

/**
 * Slice events into per-turn groups for the waterfall (Phase 4).
 * Turn 0 collects the pre-interview setup events (Memory load, PanelGen,
 * etc.) so judges can see the bootstrap sequence, not just live turns.
 */
export function groupByTurn(events: AgentEvent[]): TurnGroup[] {
  const buckets = new Map<number, AgentEvent[]>();
  for (const ev of events) {
    const turn = ev.turn ?? 0;
    let arr = buckets.get(turn);
    if (!arr) {
      arr = [];
      buckets.set(turn, arr);
    }
    arr.push(ev);
  }

  const allSpans = pairStartEnd(events);

  const groups: TurnGroup[] = [];
  for (const [turn, turnEvents] of buckets) {
    const spans = allSpans.filter((s) => s.turn === turn);
    const startTs = turnEvents[0]?.ts ?? 0;
    const endTs = turnEvents[turnEvents.length - 1]?.ts ?? startTs;
    let totalLatencyMs = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    for (const ev of turnEvents) {
      if (ev.phase !== "end") continue;
      totalLatencyMs += ev.latencyMs ?? 0;
      totalTokens += (ev.inputTokens ?? 0) + (ev.outputTokens ?? 0);
      totalCostUsd += ev.costUsd ?? 0;
    }
    groups.push({
      turn,
      events: turnEvents,
      spans,
      startTs,
      endTs,
      totalLatencyMs,
      totalTokens,
      totalCostUsd,
    });
  }

  groups.sort((a, b) => a.turn - b.turn);
  return groups;
}

/**
 * Display formatters used across the dashboard. Centralized so KPI cards
 * and breakdown rows stay visually consistent.
 */
export const fmt = {
  ms(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  },
  tokens(n: number): string {
    if (!n) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  },
  usd(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "$0.000";
    if (n >= 1) return `$${n.toFixed(2)}`;
    if (n >= 0.01) return `$${n.toFixed(3)}`;
    return `$${n.toFixed(4)}`;
  },
  count(n: number): string {
    return Intl.NumberFormat("en-US").format(n || 0);
  },
};
