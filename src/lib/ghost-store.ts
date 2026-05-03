import { useSyncExternalStore } from "react";
import type { Report } from "@/server/agents.server";
import type { Evaluation, Persona, Round } from "@/server/sessions.server";

export type SetupData = {
  role: string;
  company: string;
  jobDescription: string;
  interview_type: string;
  resume: string;
};

export type ReportState = Report & {
  rounds: Round[];
  role: string;
  company: string;
  jobDescription: string;
  interviewers: Persona[];
  panelType: string;
};

export type AppState = {
  sessionId: string | null;
  setupData: SetupData | null;
  interviewers: Persona[];
  activeInterviewer: Persona | null;
  panelType: string | null;
  currentQuestion: string;
  currentTopic: string;
  currentDifficulty: string;
  currentCoordinatorReason: string;
  currentRound: number;
  totalRounds: number;
  rounds: Round[];
  lastEvaluation: Evaluation | null;
  lastClarification: string | null;
  report: ReportState | null;
};

const initial: AppState = {
  sessionId: null,
  setupData: null,
  interviewers: [],
  activeInterviewer: null,
  panelType: null,
  currentQuestion: "",
  currentTopic: "",
  currentDifficulty: "",
  currentCoordinatorReason: "",
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
    listeners.forEach((listener) => listener());
  },
  reset: () => {
    state = initial;
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
