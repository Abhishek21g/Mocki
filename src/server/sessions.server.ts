export type InterviewerId = "practitioner" | "hiring_manager" | "recruiter";
export type InterviewType = "technical" | "behavioral" | "mixed";
export type Difficulty = "easy" | "medium" | "hard";
export type RolePanelMode = "skills" | "behavioral" | "mixed";
export type InterviewStage =
  | "intro"
  | "resume_walkthrough"
  | "core_skills"
  | "core_behavioral"
  | "candidate_questions"
  | "wrap_up";
export type TurnType = "new_question" | "follow_up" | "challenge" | "clarification" | "transition";
export type QuestionType =
  | "background"
  | "resume_deep_dive"
  | "project_deep_dive"
  | "technical_design"
  | "debugging"
  | "tradeoffs"
  | "role_execution"
  | "judgment"
  | "customer_scenario"
  | "process"
  | "behavioral"
  | "motivation"
  | "candidate_questions"
  | "closing";

export type RoleProfile = {
  panelMode: RolePanelMode;
  roleDomainLabel: string;
  coreSkillsLabel: string;
  panelArchetypes: InterviewerId[];
};

export type Persona = {
  id: InterviewerId;
  name: string;
  title: string;
  company: string;
  years: number;
  personality: string;
  focus: string;
};

export type CandidateContext = {
  resumeHighlights: string[];
  targetSkills: string[];
  experienceGaps: string[];
  likelyMotivators: string[];
};

export type Evaluation = {
  clarity: number;
  role_skill_depth: number;
  structure: number;
  overall: number;
  strengths: string[];
  weaknesses: string[];
  correct: boolean;
  missed_concepts: string[];
  answer_summary: string;
  unresolved_follow_ups: string[];
  follow_up_topics: string[];
  resume_alignment: string;
  job_requirement_alignment: string;
};

export type Plan = {
  next_interviewer_id: InterviewerId;
  stage: InterviewStage;
  turn_type: TurnType;
  question_type: QuestionType;
  focus: string;
  goal: string;
  difficulty: Difficulty;
  reason: string;
  based_on_resume: string | null;
  based_on_job_requirement: string | null;
  follow_up_to_round_id: string | null;
};

export type Round = {
  id: string;
  question: string;
  answer: string;
  evaluation: Evaluation;
  topic: string;
  difficulty: Difficulty;
  interviewerId: InterviewerId;
  interviewerName: string;
  coordinatorReason: string;
  stage: InterviewStage;
  turnType: TurnType;
  goal: string;
  basedOnResume: string | null;
  basedOnJobRequirement: string | null;
  followUpToRoundId: string | null;
};

export type Session = {
  role: string;
  company: string;
  jobDescription: string;
  interview_type: InterviewType;
  resume: string;
  interviewers: Persona[];
  activeInterviewerId: InterviewerId;
  panelType: "structured";
  roleProfile: RoleProfile;
  candidateContext: CandidateContext;
  rounds: Round[];
  currentRound: number;
  totalRounds: number;
  currentStage: InterviewStage;
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
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  const next = { ...session, ...updates };
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
