/**
 * Declarative capability registry for every agent in the system.
 *
 * Each agent declares which session-state slices it can READ, which it can
 * WRITE, and which side-effecting TOOLS it's allowed to call. Today this
 * powers the dashboard's permission chips so reviewers can see, at a glance,
 * the principle-of-least-privilege boundaries between agents.
 *
 * Future work (intentionally out of scope right now): enforce these at the
 * orchestrator boundary — the same registry that drives the UI also gates
 * the actual call site, and any violation emits a red `phase: "error"`
 * event into the trace.
 */
export type AgentCapability = {
  read: readonly string[];
  write: readonly string[];
  tools: readonly string[];
};

const NONE = { read: [], write: [], tools: [] } as const;

export const AGENT_CAPS: Record<string, AgentCapability> = {
  System: { read: ["session"], write: [], tools: [] },
  RoleProfile: { read: ["jobDescription"], write: ["roleProfile"], tools: [] },
  CandidateContext: {
    read: ["resume", "jobDescription", "memory"],
    write: ["candidateContext"],
    tools: ["nemotron"],
  },
  Memory: {
    read: ["history"],
    write: ["learnerMemory"],
    tools: ["supabase.read", "supabase.write"],
  },
  PanelGen: {
    read: ["roleProfile", "candidateContext"],
    write: ["interviewers"],
    tools: ["nemotron"],
  },
  Coordinator: {
    read: ["session", "evaluations", "memory"],
    write: ["nextTurn"],
    tools: ["nemotron"],
  },
  Interviewer: {
    read: ["session", "plan"],
    write: ["question"],
    tools: ["nemotron"],
  },
  Clarifier: {
    read: ["session", "answer"],
    write: ["clarificationFollowUp"],
    tools: ["nemotron"],
  },
  Evaluator: {
    read: ["session", "question", "answer"],
    write: ["evaluations"],
    tools: ["nemotron"],
  },
  Reporter: {
    read: ["session", "evaluations"],
    write: ["report", "memory"],
    tools: ["nemotron", "supabase.write"],
  },
  History: {
    read: ["session"],
    write: ["historyEntries"],
    tools: ["supabase.write"],
  },
  Speaker: {
    read: ["question"],
    write: [],
    tools: ["nvidia.tts"],
  },
};

export function capsFor(agent: string): AgentCapability {
  return AGENT_CAPS[agent] ?? NONE;
}

/**
 * Stable display color per agent, shared by the KPI strip, waterfall,
 * breakdown table, and event stream. Centralizing it here keeps every
 * piece of the dashboard visually consistent for the same agent.
 */
const AGENT_COLORS: Record<string, string> = {
  System: "#94a3b8",
  RoleProfile: "#60a5fa",
  CandidateContext: "#f59e0b",
  Memory: "#a78bfa",
  PanelGen: "#a78bfa",
  Coordinator: "#38bdf8",
  Interviewer: "#76b900",
  Clarifier: "#eab308",
  Evaluator: "#f97316",
  Reporter: "#ec4899",
  History: "#fb7185",
  Speaker: "#22d3ee",
};

export function agentColor(agent: string): string {
  return AGENT_COLORS[agent] ?? "#888";
}
