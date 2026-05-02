import { useSyncExternalStore } from "react";
import type { Persona, Evaluation, Round } from "@/server/sessions.server";
import type { Report } from "@/server/agents.server";

export type AppState = {
  sessionId: string | null;
  setupData: { role: string; company: string; interview_type: string; resume: string } | null;
  interviewer: Persona | null;
  currentQuestion: string;
  currentTopic: string;
  currentDifficulty: string;
  currentRound: number;
  totalRounds: number;
  rounds: Round[];
  lastEvaluation: Evaluation | null;
  lastClarification: string | null;
  report: (Report & { rounds: Round[]; role: string; company: string; interviewer: Persona }) | null;
};

const initial: AppState = {
  sessionId: null,
  setupData: null,
  interviewer: null,
  currentQuestion: "",
  currentTopic: "",
  currentDifficulty: "",
  currentRound: 1,
  totalRounds: 5,
  rounds: [],
  lastEvaluation: null,
  lastClarification: null,
  report: null,
};

let state: AppState = initial;
const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  set: (patch: Partial<AppState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  reset: () => {
    state = initial;
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
