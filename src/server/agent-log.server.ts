export type AgentLogEvent = {
  id: string;
  ts: number;
  agent: string;
  phase: "start" | "end" | "info" | "error";
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta?: Record<string, any>;
};

const g = globalThis as unknown as { __mockpilot_logs?: Map<string, AgentLogEvent[]> };
if (!g.__mockpilot_logs) g.__mockpilot_logs = new Map();
const logs = g.__mockpilot_logs;

export function pushLog(sessionId: string, ev: Omit<AgentLogEvent, "id" | "ts">) {
  if (!sessionId) return;
  const arr = logs.get(sessionId) ?? [];
  arr.push({ ...ev, id: crypto.randomUUID(), ts: Date.now() });
  if (arr.length > 500) arr.shift();
  logs.set(sessionId, arr);
}

export function getLogs(sessionId: string, sinceTs = 0): AgentLogEvent[] {
  const arr = logs.get(sessionId) ?? [];
  return sinceTs ? arr.filter((e) => e.ts > sinceTs) : arr;
}

// Per-call context: a session id we're currently working under
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
