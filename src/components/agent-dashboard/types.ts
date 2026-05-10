/**
 * Client-side mirror of `AgentLogEvent` from `src/server/agent-log.server.ts`.
 *
 * We don't import the server type directly because TanStack Start treats
 * `*.server.ts` modules as server-only — even type imports can pull in
 * server runtime constants in dev. Mirroring keeps the boundary clean.
 */
export type AgentEvent = {
  id: string;
  ts: number;
  agent: string;
  phase: "start" | "end" | "info" | "error" | string;
  message: string;
  turn?: number;
  corrId?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  model?: string;
  meta?: Record<string, unknown>;
};

/**
 * A paired start/end (or start/error) for a single Nemotron call. Used by
 * the waterfall view in Phase 4.
 */
export type AgentSpan = {
  corrId: string;
  agent: string;
  startTs: number;
  /** Only set once the matching end/error event has arrived. */
  endTs?: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  model?: string;
  status: "ok" | "error" | "running";
  /** 1-based turn index this call belongs to (0 = pre-interview setup). */
  turn: number;
};

export type SessionSummary = {
  totalLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  /** Distinct agent names that fired at least one event. */
  agentCount: number;
  /** Total completed Nemotron calls (= number of `end` events). */
  agentCallCount: number;
  /** Highest turn index seen so far. 0 means we're still in setup. */
  currentTurn: number;
  totalTurns: number;
  lastTurnLatencyMs: number;
  lastTurnCostUsd: number;
};

export type AgentSummary = {
  agent: string;
  callCount: number;
  eventCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  errorCount: number;
};

// ---------------------------------------------------------------------------
// Viewer session — safe subset of Session passed to the Control Room UI.
// No resume/JD text. Defined client-side so components can import it without
// touching any *.server.ts boundary.
// ---------------------------------------------------------------------------

export type ViewerInterviewer = {
  id: string;
  name: string;
  title: string;
  personality: string;
  focus: string;
};

export type ViewerRound = {
  id: string;
  question: string;
  answer: string;
  interviewerName: string;
  interviewerId: string;
  stage: string;
  turnType: string;
  evaluation: {
    overall: number;
    answer_summary: string;
    strengths: string[];
    weaknesses: string[];
  };
};

export type ViewerSession = {
  role: string;
  company: string;
  interview_type: string;
  currentRound: number;
  totalRounds: number;
  activeInterviewerId: string | null;
  interviewers: ViewerInterviewer[];
  currentStage: string;
  currentFocus: string;
  currentDifficulty: string;
  currentCoordinatorReason: string;
  currentTurnType: string;
  lastQuestion: string | null;
  rounds: ViewerRound[];
};

export type TurnGroup = {
  turn: number;
  events: AgentEvent[];
  spans: AgentSpan[];
  startTs: number;
  endTs: number;
  totalLatencyMs: number;
  totalTokens: number;
  totalCostUsd: number;
};
