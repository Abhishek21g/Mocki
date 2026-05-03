export type InterviewerId = "senior_engineer" | "hiring_manager" | "recruiter";
export type InterviewType = "technical" | "behavioral" | "mixed";
export type Difficulty = "easy" | "medium" | "hard";

export type Persona = {
  id: InterviewerId;
  name: string;
  title: string;
  company: string;
  years: number;
  personality: string;
  focus: string;
};

export type Evaluation = {
  clarity: number;
  technical_depth: number;
  structure: number;
  overall: number;
  strengths: string[];
  weaknesses: string[];
  correct: boolean;
  missed_concepts: string[];
};

export type Plan = {
  next_interviewer_id: InterviewerId;
  question_type: string;
  difficulty: Difficulty;
  reason: string;
};

export type Round = {
  question: string;
  answer: string;
  evaluation: Evaluation;
  topic: string;
  difficulty: Difficulty;
  interviewerId: InterviewerId;
  interviewerName: string;
  coordinatorReason: string;
};

export type Session = {
  role: string;
  company: string;
  jobDescription: string;
  interview_type: InterviewType;
  resume: string;
  interviewers: Persona[];
  activeInterviewerId: InterviewerId;
  panelType: "standard";
  rounds: Round[];
  currentRound: number;
  lastQuestion: string | null;
  lastPlan: Plan | null;
  lastClarified: boolean;
  createdAt: number;
};

const g = globalThis as unknown as { __mockpilot_sessions?: Map<string, Session> };
if (!g.__mockpilot_sessions) g.__mockpilot_sessions = new Map();
const sessions = g.__mockpilot_sessions;

export function createSession(
  id: string,
  data: Omit<
    Session,
    "rounds" | "currentRound" | "lastQuestion" | "lastPlan" | "lastClarified" | "createdAt"
  >,
) {
  sessions.set(id, {
    ...data,
    rounds: [],
    currentRound: 0,
    lastQuestion: null,
    lastPlan: null,
    lastClarified: false,
    createdAt: Date.now(),
  });
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function updateSession(id: string, updates: Partial<Session>): Session {
  const s = sessions.get(id);
  if (!s) throw new Error("Session not found: " + id);
  const next = { ...s, ...updates };
  sessions.set(id, next);
  return next;
}

export function getInterviewerById(session: Session, interviewerId: InterviewerId): Persona {
  const interviewer = session.interviewers.find((candidate) => candidate.id === interviewerId);
  if (!interviewer) {
    throw new Error(`Interviewer not found: ${interviewerId}`);
  }
  return interviewer;
}
