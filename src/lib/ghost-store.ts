import { useSyncExternalStore } from "react";
import type { Report } from "@/server/agents.server";
import type {
  Evaluation,
  InterviewStage,
  Persona,
  RoleProfile,
  Round,
  TurnType,
} from "@/server/sessions.server";

export type SetupData = {
  role: string;
  company: string;
  jobDescription: string;
  interview_type: string;
  resume: string;
  roleProfile: RoleProfile;
};

export type ReportState = Report & {
  rounds: Round[];
  role: string;
  company: string;
  jobDescription: string;
  interviewers: Persona[];
  panelType: string;
  totalRounds: number;
  roleProfile: RoleProfile;
};

export type AppState = {
  sessionId: string | null;
  setupData: SetupData | null;
  interviewers: Persona[];
  activeInterviewer: Persona | null;
  panelType: string | null;
  roleProfile: RoleProfile | null;
  currentQuestion: string;
  currentFocus: string;
  currentDifficulty: string;
  currentCoordinatorReason: string;
  currentStage: InterviewStage;
  currentTurnType: TurnType;
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
  roleProfile: null,
  currentQuestion: "",
  currentFocus: "",
  currentDifficulty: "",
  currentCoordinatorReason: "",
  currentStage: "intro",
  currentTurnType: "new_question",
  currentRound: 1,
  totalRounds: 6,
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
