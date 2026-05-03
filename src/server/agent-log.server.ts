/**
 * In-memory observability log for agent activity per session.
 *
 * Powers the agent-dashboard UI (KPI strip, waterfall, breakdown, stream).
 * Every event records who fired (`agent`), when (`ts`), what stage (`phase`),
 * and — for Nemotron calls — structured performance metadata that lets the
 * dashboard compute aggregates without re-parsing free-form messages.
 */
export type AgentLogPhase = "start" | "end" | "info" | "error";

export type AgentLogEvent = {
  id: string;
  ts: number;
  agent: string;
  phase: AgentLogPhase;
  message: string;
  /**
   * 1-based turn index. `0` = pre-interview setup (PanelGen, Memory load,
   * CandidateContext). `1`+ = active interview turns. Auto-attached by
   * `pushLog` from the per-session counter; explicit `markTurnBoundary`
   * advances it.
   */
  turn?: number;
  /**
   * Pairs `start` and `end` events for the same Nemotron call so the
   * dashboard can compute span-level latency without heuristics.
   */
  corrId?: string;
  /** Wall-clock ms between paired start/end. Set on the `end` event. */
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  /** Nemotron model id (e.g. `nvidia/nvidia-nemotron-nano-9b-v2`). */
  model?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta?: Record<string, any>;
};

const g = globalThis as unknown as {
  __mockpilot_logs?: Map<string, AgentLogEvent[]>;
  __mockpilot_turns?: Map<string, number>;
};
if (!g.__mockpilot_logs) g.__mockpilot_logs = new Map();
if (!g.__mockpilot_turns) g.__mockpilot_turns = new Map();
const logs = g.__mockpilot_logs;
const turns = g.__mockpilot_turns;

/**
 * Bumps the per-session turn counter and emits a marker event that the
 * dashboard uses to slice the timeline. Call this when a new question is
 * accepted (NOT for clarifications, which are sub-turns).
 */
export function markTurnBoundary(sessionId: string, message?: string): number {
  if (!sessionId) return 0;
  const next = (turns.get(sessionId) ?? 0) + 1;
  turns.set(sessionId, next);
  pushLog(sessionId, {
    agent: "System",
    phase: "info",
    message: message ?? `Turn ${next} started`,
  });
  return next;
}

export function currentTurn(sessionId: string): number {
  return turns.get(sessionId) ?? 0;
}

export function pushLog(
  sessionId: string,
  ev: Omit<AgentLogEvent, "id" | "ts" | "turn"> & { turn?: number },
) {
  if (!sessionId) return;
  const arr = logs.get(sessionId) ?? [];
  const turn = ev.turn ?? turns.get(sessionId) ?? 0;
  arr.push({ ...ev, id: crypto.randomUUID(), ts: Date.now(), turn });
  if (arr.length > 500) arr.shift();
  logs.set(sessionId, arr);
}

export function getLogs(sessionId: string, sinceTs = 0): AgentLogEvent[] {
  const arr = logs.get(sessionId) ?? [];
  return sinceTs ? arr.filter((e) => e.ts > sinceTs) : arr;
}

// Per-call context: a session id we're currently working under.
const callCtx = { current: null as string | null };
export function withSessionLog<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  callCtx.current = sessionId;
  return fn().finally(() => {
    callCtx.current = null;
  });
}
export function currentSessionId() {
  return callCtx.current;
}
