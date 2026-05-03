import { callNemotron, parseJSON } from "./nim.server";
import type {
  CandidateContext,
  Difficulty,
  Evaluation,
  InterviewStage,
  InterviewType,
  InterviewerId,
  Persona,
  Plan,
  QuestionType,
  RoleProfile,
  Session,
  TurnType,
} from "./sessions.server";

const PANEL_ARCHETYPES: InterviewerId[] = ["practitioner", "hiring_manager", "recruiter"];
const SOFTWARE_QUESTION_TYPES = new Set<QuestionType>([
  "project_deep_dive",
  "technical_design",
  "debugging",
  "tradeoffs",
]);
const NON_SOFTWARE_QUESTION_TYPES = new Set<QuestionType>([
  "role_execution",
  "customer_scenario",
  "process",
  "judgment",
]);
const ALL_QUESTION_TYPES = new Set<QuestionType>([
  "background",
  "resume_deep_dive",
  "project_deep_dive",
  "technical_design",
  "debugging",
  "tradeoffs",
  "role_execution",
  "judgment",
  "customer_scenario",
  "process",
  "behavioral",
  "motivation",
  "candidate_questions",
  "closing",
]);

const INTERVIEWER_BLUEPRINTS: Record<
  InterviewerId,
  {
    fallbackName: string;
    brief: string;
  }
> = {
  practitioner: {
    fallbackName: "Maya",
    brief: "Pushes on day-to-day execution, scenario judgment, and role-specific depth.",
  },
  hiring_manager: {
    fallbackName: "Jordan",
    brief: "Tests ownership, reliability, collaboration, and how the candidate operates on a team.",
  },
  recruiter: {
    fallbackName: "Avery",
    brief: "Covers motivation, communication, logistics, and overall fit for the role.",
  },
};

const STAGES: InterviewStage[] = [
  "intro",
  "resume_walkthrough",
  "core_skills",
  "core_behavioral",
  "candidate_questions",
  "wrap_up",
];

const CANDIDATE_CONTEXT_SYSTEM = `You turn a resume and job description into compact interview context.

Output ONLY valid JSON:
{
  "resumeHighlights": ["...", "...", "..."],
  "targetSkills": ["...", "...", "...", "..."],
  "experienceGaps": ["...", "...", "..."],
  "likelyMotivators": ["...", "..."]
}

Rules:
- Keep each item short and concrete.
- Pull targetSkills from the job description.
- Pull resumeHighlights from actual candidate experience.
- experienceGaps should identify likely weak or missing areas relative to the role.
- likelyMotivators should be inferred conservatively from the resume and role.
- Output JSON only.`;

const COORDINATOR_SYSTEM = `You are the planner for a realistic panel interview.

Your job is to decide the NEXT conversational move so the interview feels sequential, reactive, and human.

You manage these interview stages:
- intro
- resume_walkthrough
- core_skills
- core_behavioral
- candidate_questions
- wrap_up

You also choose a turn type:
- new_question
- follow_up
- challenge
- clarification
- transition

Output ONLY valid JSON:
{
  "next_interviewer_id": "practitioner" | "hiring_manager" | "recruiter",
  "stage": "intro" | "resume_walkthrough" | "core_skills" | "core_behavioral" | "candidate_questions" | "wrap_up",
  "turn_type": "new_question" | "follow_up" | "challenge" | "clarification" | "transition",
  "question_type": "background" | "resume_deep_dive" | "project_deep_dive" | "technical_design" | "debugging" | "tradeoffs" | "role_execution" | "judgment" | "customer_scenario" | "process" | "behavioral" | "motivation" | "candidate_questions" | "closing",
  "focus": "short phrase for what this turn is testing",
  "goal": "what the interviewer wants to learn from the candidate",
  "difficulty": "easy" | "medium" | "hard",
  "reason": "one concise sentence for the trace",
  "based_on_resume": "specific resume item or empty string",
  "based_on_job_requirement": "specific requirement or empty string",
  "follow_up_to_round_id": "round id or empty string"
}

Rules:
- Make the interview feel like one coherent conversation, not a quiz.
- Opening sequence should usually be intro, then resume_walkthrough, before deeper probing.
- Prefer staying with the same interviewer for 2-3 connected turns when they are probing the same answer.
- Use follow_up or challenge when the previous answer created a natural next question.
- Use resume details in intro, resume_walkthrough, and behavioral stages.
- Use job requirements heavily in core_skills and fit-related stages.
- Use recruiter for intro, motivation, candidate_questions, and some resume walkthrough.
- Use practitioner for role-skill deep dives, real scenarios, and tradeoffs.
- Use hiring_manager for behavioral depth, ownership, reliability, and team judgment.
- If the role profile says software engineering or the core skills label is Technical Depth, practitioner questions may use project_deep_dive, technical_design, debugging, and tradeoffs.
- Otherwise, prefer role_execution, customer_scenario, process, and judgment for core_skills.
- candidate_questions should feel like a realistic late-stage conversation, such as asking what the candidate is optimizing for or how they evaluate team fit.
- wrap_up should be short and natural.
- Keep difficulty medium in the first two turns unless the user answer is exceptionally strong.
- If the previous answer was partial but promising, prefer a follow_up from the same interviewer over switching topics.
- Output JSON only.`;

const INTERVIEWER_SYSTEM = `You are a real interviewer in a mock interview panel.

You are not generating a quiz prompt. You are saying the next thing this interviewer would naturally say out loud.

Rules:
- Sound human, direct, and conversational.
- Keep it to 1-3 sentences.
- You may briefly acknowledge the candidate's previous answer before asking the next thing.
- If turn_type is follow_up or challenge, build directly on the candidate's previous answer.
- If stage is intro or resume_walkthrough, anchor the question in the candidate's background.
- If stage is core_skills or core_behavioral, anchor the question in the job requirements and prior answers.
- Keep the language realistic for the role domain; do not force software-engineering terms into non-technical jobs.
- Do not say "Here is your next question."
- Do not mention JSON, stages, turns, or hidden planning logic.
- Do not coach or evaluate.
- Output only the interviewer utterance.`;

const EVALUATOR_SYSTEM = `You are an expert interview evaluator.

Evaluate the candidate's answer in the context of the role, the interview stage, and what the interviewer was trying to learn.

Output ONLY valid JSON:
{
  "clarity": <integer 1-10>,
  "role_skill_depth": <integer 1-10>,
  "structure": <integer 1-10>,
  "overall": <float 1.0-10.0 with one decimal>,
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "correct": <boolean>,
  "missed_concepts": ["...", "..."],
  "answer_summary": "1-2 sentence summary of what the candidate actually said",
  "unresolved_follow_ups": ["...", "..."],
  "follow_up_topics": ["...", "..."],
  "resume_alignment": "one short sentence about how well the answer connected to their background",
  "job_requirement_alignment": "one short sentence about how well the answer matched the job"
}

Rules:
- Be strict but fair.
- role_skill_depth means the depth of job-relevant skills for this role. For software roles, that includes technical depth.
- unresolved_follow_ups should only include things a realistic interviewer would naturally probe next.
- follow_up_topics should be short phrases.
- Use the interview stage and turn goal when scoring.
- Output JSON only.`;

const REPORT_SYSTEM = `You are generating a final debrief report for a coherent mock interview conversation.

Output ONLY valid JSON:
{
  "overall_score": <float 1.0-10.0 one decimal>,
  "hire_decision": "strong yes" | "yes" | "lean yes" | "maybe" | "lean no" | "no" | "strong no",
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "drill_questions": ["...", "...", "..."],
  "study_plan": "4-5 sentence action plan"
}

The report should reflect the interview as a realistic conversation, not disconnected questions.
Output JSON only.`;

function sanitizeInterviewerId(value: unknown): InterviewerId | null {
  if (value === "practitioner" || value === "hiring_manager" || value === "recruiter") {
    return value;
  }
  return null;
}

function sanitizeDifficulty(value: unknown): Difficulty {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  return "medium";
}

function sanitizeStage(value: unknown): InterviewStage | null {
  if (typeof value !== "string") return null;
  return STAGES.includes(value as InterviewStage) ? (value as InterviewStage) : null;
}

function sanitizeTurnType(value: unknown): TurnType | null {
  if (
    value === "new_question" ||
    value === "follow_up" ||
    value === "challenge" ||
    value === "clarification" ||
    value === "transition"
  ) {
    return value;
  }
  return null;
}

function sanitizeQuestionType(value: unknown): QuestionType | null {
  if (typeof value !== "string") return null;
  return ALL_QUESTION_TYPES.has(value as QuestionType) ? (value as QuestionType) : null;
}

function sanitizeScore(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function sanitizeOverallScore(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(10, Number(value.toFixed(1))));
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function cleanQuestionText(question: string) {
  let cleaned = question.trim();

  for (let i = 0; i < 3; i += 1) {
    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed === "string") {
        cleaned = parsed.trim();
        continue;
      }
    } catch {
      // Fall through to manual cleanup below.
    }

    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
      continue;
    }

    break;
  }

  return cleaned
    .replace(/\\"/g, '"')
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function isSoftwareRoleText(value: string) {
  return /\b(software|frontend|backend|full[ -]?stack|engineer|developer|programmer|devops|sre|platform|data engineer|machine learning|ml engineer|qa automation)\b/i.test(
    value,
  );
}

function isSoftwareRoleProfile(roleProfile: RoleProfile) {
  return roleProfile.coreSkillsLabel === "Technical Depth";
}

function cleanRoleText(role: string) {
  return role
    .replace(/\s+@\s+.+$/i, "")
    .replace(/\s+-\s+.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string) {
  return value.replace(/\w\S*/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase());
}

function shortRoleDomain(role: string) {
  return cleanRoleText(role).toLowerCase().split(/\s+/).slice(0, 4).join(" ");
}

function looksCustomerFacing(role: string, jobDescription: string) {
  return /\b(customer|guest|service|sales|retail|front desk|support|cashier|barista|server|host)\b/i.test(
    `${role} ${jobDescription}`,
  );
}

function inferRoleDomainLabel(role: string, jobDescription: string) {
  const haystack = `${role} ${jobDescription}`.toLowerCase();
  if (/\b(barista|espresso|coffee|cafe)\b/.test(haystack)) return "barista";
  if (
    /\b(customer support|support specialist|support representative|help desk|call center)\b/.test(
      haystack,
    )
  ) {
    return "customer support";
  }
  if (/\b(retail|cashier|store associate|sales associate|merchandising)\b/.test(haystack)) {
    return "retail";
  }
  if (isSoftwareRoleText(haystack)) return "software engineering";
  if (/\b(warehouse|logistics|fulfillment|operations)\b/.test(haystack)) return "operations";
  if (/\b(marketing|content|growth)\b/.test(haystack)) return "marketing";
  if (/\b(design|ux|ui|product design|graphic design)\b/.test(haystack)) return "design";
  return shortRoleDomain(role) || "general operations";
}

export function deriveRoleProfile(
  role: string,
  jobDescription: string,
  interviewType: InterviewType,
): RoleProfile {
  const roleDomainLabel = inferRoleDomainLabel(role, jobDescription);
  const panelMode =
    interviewType === "behavioral" ? "behavioral" : interviewType === "mixed" ? "mixed" : "skills";

  return {
    panelMode,
    roleDomainLabel,
    coreSkillsLabel: isSoftwareRoleText(`${role} ${jobDescription}`)
      ? "Technical Depth"
      : "Role Skills",
    panelArchetypes: [...PANEL_ARCHETYPES],
  };
}

function fallbackTitleForInterviewer(
  interviewerId: InterviewerId,
  role: string,
  roleProfile: RoleProfile,
) {
  const cleanRole = cleanRoleText(role);
  const lowerRole = cleanRole.toLowerCase();

  if (interviewerId === "practitioner") {
    if (isSoftwareRoleProfile(roleProfile)) {
      return /engineer|developer/i.test(cleanRole) ? cleanRole : "Software Engineer";
    }
    if (/\bbarista\b/i.test(lowerRole)) return "Senior Barista";
    if (/\bcustomer support|support representative|support specialist\b/i.test(lowerRole)) {
      return "Customer Support Specialist";
    }
    if (/\bcashier|sales associate|store associate|retail associate\b/i.test(lowerRole)) {
      return "Senior Sales Associate";
    }
    if (/\bwarehouse|fulfillment|operations\b/i.test(lowerRole)) return "Operations Specialist";
    return cleanRole ? toTitleCase(cleanRole) : "Senior Team Member";
  }

  if (interviewerId === "hiring_manager") {
    if (isSoftwareRoleProfile(roleProfile)) return "Engineering Manager";
    if (roleProfile.roleDomainLabel === "barista") return "Cafe Manager";
    if (roleProfile.roleDomainLabel === "retail") return "Store Manager";
    if (roleProfile.roleDomainLabel === "customer support") return "Support Manager";
    if (roleProfile.roleDomainLabel === "operations") return "Operations Manager";
    if (roleProfile.roleDomainLabel === "marketing") return "Marketing Manager";
    if (roleProfile.roleDomainLabel === "design") return "Design Manager";
    return "Hiring Manager";
  }

  return isSoftwareRoleProfile(roleProfile) ? "Technical Recruiter" : "Talent Partner";
}

function fallbackFocusForInterviewer(interviewerId: InterviewerId, roleProfile: RoleProfile) {
  if (interviewerId === "practitioner") {
    return isSoftwareRoleProfile(roleProfile)
      ? "technical depth, tradeoffs, debugging, and system thinking"
      : "day-to-day execution, real scenarios, process judgment, and role-specific problem solving";
  }
  if (interviewerId === "hiring_manager") {
    return "ownership, teamwork, reliability, and decision-making";
  }
  return "candidate motivation, communication, logistics, and role fit";
}

function isEngineeringBiasedTitle(title: string) {
  return /\b(engineer|developer|architect|sre|devops)\b/i.test(title);
}

function isEngineeringBiasedFocus(focus: string) {
  return /\b(system design|architecture|debugging|technical depth|distributed systems)\b/i.test(
    focus,
  );
}

function normalizePersona(
  raw: unknown,
  interviewerId: InterviewerId,
  company: string,
  role: string,
  roleProfile: RoleProfile,
): Persona {
  const defaults = INTERVIEWER_BLUEPRINTS[interviewerId];
  const value = (raw ?? {}) as Partial<Persona>;
  const fallbackTitle = fallbackTitleForInterviewer(interviewerId, role, roleProfile);
  const parsedTitle =
    typeof value.title === "string" && value.title.trim() ? value.title.trim() : fallbackTitle;
  const title =
    !isSoftwareRoleProfile(roleProfile) &&
    interviewerId !== "recruiter" &&
    isEngineeringBiasedTitle(parsedTitle)
      ? fallbackTitle
      : parsedTitle;
  const fallbackFocus = fallbackFocusForInterviewer(interviewerId, roleProfile);
  const parsedFocus =
    typeof value.focus === "string" && value.focus.trim() ? value.focus.trim() : fallbackFocus;
  const focus =
    !isSoftwareRoleProfile(roleProfile) && isEngineeringBiasedFocus(parsedFocus)
      ? fallbackFocus
      : parsedFocus;

  return {
    id: interviewerId,
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : defaults.fallbackName,
    title,
    company:
      typeof value.company === "string" && value.company.trim() ? value.company.trim() : company,
    years:
      typeof value.years === "number" && Number.isFinite(value.years)
        ? Math.max(4, Math.min(18, Math.round(value.years)))
        : interviewerId === "recruiter"
          ? 7
          : 10,
    personality:
      typeof value.personality === "string" && value.personality.trim()
        ? value.personality.trim()
        : "direct, thoughtful, high-signal",
    focus,
  };
}

function fallbackCandidateContext(resume: string, jobDescription: string): CandidateContext {
  const resumeHighlights = resume
    .split(/[\n.•-]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 20)
    .slice(0, 3);
  const targetSkills = jobDescription
    .split(/[\n,.;•-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 3)
    .slice(0, 4);

  return {
    resumeHighlights: resumeHighlights.length
      ? resumeHighlights
      : ["Candidate background summary unavailable."],
    targetSkills: targetSkills.length ? targetSkills : ["Role requirements summary unavailable."],
    experienceGaps: ["Need stronger evidence of role-specific depth."],
    likelyMotivators: ["Interest in growth and impact."],
  };
}

function defaultStageForRound(session: Session, roundNumber: number): InterviewStage {
  if (roundNumber <= 1) return "intro";
  if (roundNumber === 2) return "resume_walkthrough";
  if (roundNumber === session.totalRounds) return "wrap_up";
  if (roundNumber === session.totalRounds - 1) {
    return session.interview_type === "technical" ? "core_behavioral" : "candidate_questions";
  }
  if (session.interview_type === "behavioral") return "core_behavioral";
  if (session.interview_type === "technical") return "core_skills";
  return roundNumber % 2 === 1 ? "core_skills" : "core_behavioral";
}

function defaultQuestionTypeForStage(stage: InterviewStage, session: Session): QuestionType {
  switch (stage) {
    case "intro":
      return "background";
    case "resume_walkthrough":
      return "resume_deep_dive";
    case "core_skills":
      if (isSoftwareRoleProfile(session.roleProfile)) return "project_deep_dive";
      return looksCustomerFacing(session.role, session.jobDescription)
        ? "customer_scenario"
        : "role_execution";
    case "core_behavioral":
      return "behavioral";
    case "candidate_questions":
      return "candidate_questions";
    case "wrap_up":
      return "closing";
  }
}

function defaultInterviewerForStage(stage: InterviewStage): InterviewerId {
  switch (stage) {
    case "intro":
      return "recruiter";
    case "resume_walkthrough":
      return "recruiter";
    case "core_skills":
      return "practitioner";
    case "core_behavioral":
      return "hiring_manager";
    case "candidate_questions":
      return "recruiter";
    case "wrap_up":
      return "recruiter";
  }
}

function defaultTurnTypeForStage(session: Session, stage: InterviewStage): TurnType {
  const lastRound = session.rounds.at(-1);
  if (
    lastRound &&
    lastRound.stage === stage &&
    lastRound.evaluation.unresolved_follow_ups.length > 0 &&
    lastRound.turnType !== "clarification"
  ) {
    return lastRound.stage === "core_skills" ? "challenge" : "follow_up";
  }
  return stage === "wrap_up" ? "transition" : "new_question";
}

function defaultFocusForStage(stage: InterviewStage, session: Session): string {
  switch (stage) {
    case "intro":
      return "candidate background and role fit";
    case "resume_walkthrough":
      return session.candidateContext.resumeHighlights[0] ?? "resume walkthrough";
    case "core_skills":
      return session.candidateContext.targetSkills[0] ?? "role-specific problem solving";
    case "core_behavioral":
      return "ownership, teamwork, and decision-making";
    case "candidate_questions":
      return "candidate priorities and mutual fit";
    case "wrap_up":
      return "final signal and close";
  }
}

function defaultGoalForStage(stage: InterviewStage, session: Session): string {
  switch (stage) {
    case "intro":
      return "Understand the candidate's background and what attracts them to the role.";
    case "resume_walkthrough":
      return "Dig into a real experience from the resume and understand scope and impact.";
    case "core_skills":
      return `Test ${session.roleProfile.coreSkillsLabel.toLowerCase()}, judgment, and problem-solving under realistic job constraints.`;
    case "core_behavioral":
      return "Test ownership, collaboration, communication, and judgment.";
    case "candidate_questions":
      return "Understand what the candidate values and how they think about team fit.";
    case "wrap_up":
      return "Close naturally and surface the strongest final signal from the candidate.";
  }
}

function defaultDifficultyForStage(stage: InterviewStage, roundNumber: number): Difficulty {
  if (roundNumber <= 2) return "medium";
  if (stage === "wrap_up" || stage === "candidate_questions") return "easy";
  return "medium";
}

function defaultResumeAnchor(session: Session, stage: InterviewStage) {
  if (stage === "intro" || stage === "resume_walkthrough" || stage === "core_behavioral") {
    return session.candidateContext.resumeHighlights[0] ?? null;
  }
  return null;
}

function defaultJobAnchor(session: Session, stage: InterviewStage) {
  if (stage === "core_skills" || stage === "core_behavioral") {
    return session.candidateContext.targetSkills[0] ?? null;
  }
  return null;
}

function defaultPlan(session: Session): Plan {
  const roundNumber = session.currentRound + 1;
  const stage = defaultStageForRound(session, roundNumber);
  const lastRound = session.rounds.at(-1);
  const turnType = defaultTurnTypeForStage(session, stage);
  const nextInterviewer =
    turnType !== "new_question" && lastRound && lastRound.stage === stage
      ? lastRound.interviewerId
      : defaultInterviewerForStage(stage);

  return {
    next_interviewer_id: nextInterviewer,
    stage,
    turn_type: turnType,
    question_type: defaultQuestionTypeForStage(stage, session),
    focus: defaultFocusForStage(stage, session),
    goal: defaultGoalForStage(stage, session),
    difficulty: defaultDifficultyForStage(stage, roundNumber),
    reason:
      turnType === "new_question"
        ? `Move into ${humanize(stage)} to keep the interview progressing naturally.`
        : `Stay with ${humanize(nextInterviewer)} for a natural ${turnType.replace("_", " ")} on the previous answer.`,
    based_on_resume: defaultResumeAnchor(session, stage),
    based_on_job_requirement: defaultJobAnchor(session, stage),
    follow_up_to_round_id: lastRound && turnType !== "new_question" ? lastRound.id : null,
  };
}

function trimStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeEvaluation(raw: unknown): Evaluation {
  const value = (raw ?? {}) as Partial<Evaluation> & { technical_depth?: unknown };

  return {
    clarity: sanitizeScore(value.clarity, 6),
    role_skill_depth: sanitizeScore(value.role_skill_depth ?? value.technical_depth, 6),
    structure: sanitizeScore(value.structure, 6),
    overall: sanitizeOverallScore(value.overall, 6),
    strengths: trimStringArray(value.strengths, 4),
    weaknesses: trimStringArray(value.weaknesses, 4),
    correct: typeof value.correct === "boolean" ? value.correct : true,
    missed_concepts: trimStringArray(value.missed_concepts, 4),
    answer_summary:
      typeof value.answer_summary === "string" && value.answer_summary.trim()
        ? value.answer_summary.trim()
        : "The answer addressed part of the prompt but needs a clearer summary.",
    unresolved_follow_ups: trimStringArray(value.unresolved_follow_ups, 4),
    follow_up_topics: trimStringArray(value.follow_up_topics, 4),
    resume_alignment:
      typeof value.resume_alignment === "string" && value.resume_alignment.trim()
        ? value.resume_alignment.trim()
        : "The answer referenced the candidate's background only loosely.",
    job_requirement_alignment:
      typeof value.job_requirement_alignment === "string" && value.job_requirement_alignment.trim()
        ? value.job_requirement_alignment.trim()
        : "The answer only partially matched the stated job requirements.",
  };
}

function isQuestionTypeAllowedForStage(
  questionType: QuestionType,
  stage: InterviewStage,
  roleProfile: RoleProfile,
) {
  switch (stage) {
    case "intro":
      return questionType === "background" || questionType === "motivation";
    case "resume_walkthrough":
      return questionType === "resume_deep_dive";
    case "core_skills":
      return isSoftwareRoleProfile(roleProfile)
        ? SOFTWARE_QUESTION_TYPES.has(questionType) || questionType === "project_deep_dive"
        : NON_SOFTWARE_QUESTION_TYPES.has(questionType);
    case "core_behavioral":
      return questionType === "behavioral" || questionType === "judgment";
    case "candidate_questions":
      return questionType === "candidate_questions" || questionType === "motivation";
    case "wrap_up":
      return questionType === "closing";
  }
}

export async function generateCandidateContext(
  role: string,
  company: string,
  resume: string,
  jobDescription: string,
  learnerMemoryPrompt?: string | null,
): Promise<CandidateContext> {
  const memoryBlock = learnerMemoryPrompt
    ? `\n\nReturning Candidate Memory (from prior mock interviews on this account):\n${learnerMemoryPrompt}`
    : "";
  const raw = await callNemotron(
    CANDIDATE_CONTEXT_SYSTEM,
    `Role: ${role}
Company: ${company}

Resume:
${resume.slice(0, 3000)}

Job Description:
${jobDescription.slice(0, 3000)}${memoryBlock}

Generate compact interview context. If returning candidate memory is provided, lean experienceGaps and targetSkills toward areas the candidate has previously struggled with so this interview pushes on those gaps. Output JSON only.`,
    0.3,
    350,
    "CandidateContext",
  );

  const parsed = parseJSON<Partial<CandidateContext>>(raw);
  const fallback = fallbackCandidateContext(resume, jobDescription);

  return {
    resumeHighlights: trimStringArray(parsed.resumeHighlights, 4).length
      ? trimStringArray(parsed.resumeHighlights, 4)
      : fallback.resumeHighlights,
    targetSkills: trimStringArray(parsed.targetSkills, 5).length
      ? trimStringArray(parsed.targetSkills, 5)
      : fallback.targetSkills,
    experienceGaps: trimStringArray(parsed.experienceGaps, 4).length
      ? trimStringArray(parsed.experienceGaps, 4)
      : fallback.experienceGaps,
    likelyMotivators: trimStringArray(parsed.likelyMotivators, 3).length
      ? trimStringArray(parsed.likelyMotivators, 3)
      : fallback.likelyMotivators,
  };
}

export async function runCoordinator(session: Session): Promise<Plan> {
  const fallback = defaultPlan(session);
  const historyText =
    session.rounds.length === 0
      ? "No previous turns. Start naturally."
      : session.rounds
          .map(
            (round, index) => `
Turn ${index + 1}:
  stage=${round.stage}
  turnType=${round.turnType}
  interviewer=${round.interviewerName} (${round.interviewerId})
  focus=${round.topic}
  goal=${round.goal}
  question=${round.question}
  answerSummary=${round.evaluation.answer_summary}
  unresolvedFollowUps=${round.evaluation.unresolved_follow_ups.join(" | ")}
  resumeAnchor=${round.basedOnResume ?? "none"}
  jobAnchor=${round.basedOnJobRequirement ?? "none"}
  score=${round.evaluation.overall}`,
          )
          .join("\n");

  const interviewerRoster = session.interviewers
    .map(
      (persona) =>
        `- ${persona.id}: ${persona.name}, ${persona.title}, focus=${persona.focus}, personality=${persona.personality}`,
    )
    .join("\n");

  const allowedSkillTypes = isSoftwareRoleProfile(session.roleProfile)
    ? "project_deep_dive, technical_design, debugging, tradeoffs"
    : "role_execution, customer_scenario, process, judgment";

  const memorySection = session.learnerMemoryPrompt
    ? `\n${session.learnerMemoryPrompt}\nWhen helpful, push on the recurring weak areas above so this interview challenges them.\n`
    : "";

  const userMessage = `
Job Role: ${session.role}
Company: ${session.company}
Interview Type: ${session.interview_type}
Role Profile:
- Panel Mode: ${session.roleProfile.panelMode}
- Role Domain: ${session.roleProfile.roleDomainLabel}
- Core Skills Label: ${session.roleProfile.coreSkillsLabel}
- Panel Archetypes: ${session.roleProfile.panelArchetypes.join(", ")}
- Allowed Core Skills Question Types: ${allowedSkillTypes}
Total Turns: ${session.totalRounds}
Upcoming Turn Number: ${session.currentRound + 1}
Current Stage: ${session.currentStage}
Current Active Interviewer: ${session.activeInterviewerId}

Candidate Context:
- Resume Highlights: ${session.candidateContext.resumeHighlights.join(" | ")}
- Target Skills: ${session.candidateContext.targetSkills.join(" | ")}
- Experience Gaps: ${session.candidateContext.experienceGaps.join(" | ")}
- Likely Motivators: ${session.candidateContext.likelyMotivators.join(" | ")}
${memorySection}
Panel Roster:
${interviewerRoster}

Recent Transcript:
${historyText}

Decide the next conversational move. Output JSON only.`;

  const raw = await callNemotron(COORDINATOR_SYSTEM, userMessage, 0.35, 320, "Coordinator");
  const parsed = parseJSON<Partial<Plan>>(raw);

  const stage = sanitizeStage(parsed.stage) ?? fallback.stage;
  const turnType = sanitizeTurnType(parsed.turn_type) ?? fallback.turn_type;
  const nextInterviewerId =
    sanitizeInterviewerId(parsed.next_interviewer_id) ??
    (turnType !== "new_question" && fallback.follow_up_to_round_id
      ? (session.rounds.at(-1)?.interviewerId ?? fallback.next_interviewer_id)
      : defaultInterviewerForStage(stage));
  const parsedQuestionType = sanitizeQuestionType(parsed.question_type);
  const questionType =
    parsedQuestionType &&
    isQuestionTypeAllowedForStage(parsedQuestionType, stage, session.roleProfile)
      ? parsedQuestionType
      : defaultQuestionTypeForStage(stage, session);

  return {
    next_interviewer_id: nextInterviewerId,
    stage,
    turn_type: turnType,
    question_type: questionType,
    focus:
      typeof parsed.focus === "string" && parsed.focus.trim()
        ? parsed.focus.trim()
        : defaultFocusForStage(stage, session),
    goal:
      typeof parsed.goal === "string" && parsed.goal.trim()
        ? parsed.goal.trim()
        : defaultGoalForStage(stage, session),
    difficulty: sanitizeDifficulty(parsed.difficulty ?? fallback.difficulty),
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : fallback.reason,
    based_on_resume:
      typeof parsed.based_on_resume === "string" && parsed.based_on_resume.trim()
        ? parsed.based_on_resume.trim()
        : defaultResumeAnchor(session, stage),
    based_on_job_requirement:
      typeof parsed.based_on_job_requirement === "string" && parsed.based_on_job_requirement.trim()
        ? parsed.based_on_job_requirement.trim()
        : defaultJobAnchor(session, stage),
    follow_up_to_round_id:
      typeof parsed.follow_up_to_round_id === "string" && parsed.follow_up_to_round_id.trim()
        ? parsed.follow_up_to_round_id.trim()
        : fallback.follow_up_to_round_id,
  };
}

export async function runInterviewer(
  persona: Persona,
  plan: Plan,
  session: Session,
): Promise<string> {
  const recentTranscript = session.rounds
    .slice(-2)
    .map(
      (round, index) => `
Recent Turn ${index + 1}:
  interviewer=${round.interviewerName}
  stage=${round.stage}
  turnType=${round.turnType}
  question=${round.question}
  answerSummary=${round.evaluation.answer_summary}
  unresolvedFollowUps=${round.evaluation.unresolved_follow_ups.join(" | ")}`,
    )
    .join("\n");

  const memorySection = session.learnerMemoryPrompt
    ? `\nReturning Candidate Memory:\n${session.learnerMemoryPrompt}\n`
    : "";

  const userMessage = `
You are ${persona.name}, ${persona.title} at ${persona.company}.
Your style: ${persona.personality}
Your focus: ${persona.focus}

Role: ${session.role}
Company: ${session.company}
Interview Type: ${session.interview_type}
Role Profile:
- Panel Mode: ${session.roleProfile.panelMode}
- Role Domain: ${session.roleProfile.roleDomainLabel}
- Core Skills Label: ${session.roleProfile.coreSkillsLabel}

Current Stage: ${plan.stage}
Turn Type: ${plan.turn_type}
Question Type: ${plan.question_type}
Focus: ${plan.focus}
Goal: ${plan.goal}
Difficulty: ${plan.difficulty}
Resume Anchor: ${plan.based_on_resume ?? "none"}
Job Requirement Anchor: ${plan.based_on_job_requirement ?? "none"}

Candidate Context:
- Resume Highlights: ${session.candidateContext.resumeHighlights.join(" | ")}
- Target Skills: ${session.candidateContext.targetSkills.join(" | ")}
- Experience Gaps: ${session.candidateContext.experienceGaps.join(" | ")}
- Likely Motivators: ${session.candidateContext.likelyMotivators.join(" | ")}
${memorySection}
Resume:
${session.resume.slice(0, 1800)}

Job Description:
${session.jobDescription.slice(0, 1800)}

Recent Transcript:
${recentTranscript || "No prior turns yet."}

Say the next natural interviewer utterance now. Output only that utterance.`;

  const raw = await callNemotron(INTERVIEWER_SYSTEM, userMessage, 0.75, 260, "Interviewer");
  return cleanQuestionText(raw);
}

export async function runEvaluator(
  question: string,
  answer: string,
  session: Session,
  plan: Plan,
  interviewer: Persona,
): Promise<Evaluation> {
  const userMessage = `Role: ${session.role}
Company: ${session.company}
Interviewer: ${interviewer.name}, ${interviewer.title}
Role Profile:
- Panel Mode: ${session.roleProfile.panelMode}
- Role Domain: ${session.roleProfile.roleDomainLabel}
- Core Skills Label: ${session.roleProfile.coreSkillsLabel}
Stage: ${plan.stage}
Turn Type: ${plan.turn_type}
Focus: ${plan.focus}
Goal: ${plan.goal}
Resume Anchor: ${plan.based_on_resume ?? "none"}
Job Requirement Anchor: ${plan.based_on_job_requirement ?? "none"}

Candidate Context:
- Resume Highlights: ${session.candidateContext.resumeHighlights.join(" | ")}
- Target Skills: ${session.candidateContext.targetSkills.join(" | ")}
- Experience Gaps: ${session.candidateContext.experienceGaps.join(" | ")}

Interview Question: ${question}

Candidate Answer: ${answer}

Evaluate this answer. Output JSON only.`;
  const raw = await callNemotron(EVALUATOR_SYSTEM, userMessage, 0.2, 520, "Evaluator");
  return normalizeEvaluation(parseJSON(raw));
}

export type Report = {
  overall_score: number;
  hire_decision: string;
  strengths: string[];
  weaknesses: string[];
  drill_questions: string[];
  study_plan: string;
};

export async function runReportGenerator(session: Session): Promise<Report> {
  const roundsSummary = session.rounds
    .map(
      (round, index) => `
Turn ${index + 1}:
  stage=${round.stage}
  turnType=${round.turnType}
  interviewer=${round.interviewerName} (${round.interviewerId})
  focus=${round.topic}
  goal=${round.goal}
  resumeAnchor=${round.basedOnResume ?? "none"}
  jobAnchor=${round.basedOnJobRequirement ?? "none"}
  question=${round.question}
  answerSummary=${round.evaluation.answer_summary}
  scores=clarity:${round.evaluation.clarity}, role_skill_depth:${round.evaluation.role_skill_depth}, structure:${round.evaluation.structure}, overall:${round.evaluation.overall}
  strengths=${round.evaluation.strengths.join(" | ")}
  weaknesses=${round.evaluation.weaknesses.join(" | ")}
  unresolvedFollowUps=${round.evaluation.unresolved_follow_ups.join(" | ")}
  resumeAlignment=${round.evaluation.resume_alignment}
  jobAlignment=${round.evaluation.job_requirement_alignment}`,
    )
    .join("\n");

  const memorySection = session.learnerMemoryPrompt
    ? `\nReturning Candidate Memory (use this to make the study_plan and drill_questions feel personalized across sessions):\n${session.learnerMemoryPrompt}\n`
    : "";

  const userMessage = `
Job Role: ${session.role} at ${session.company}
Interview Type: ${session.interview_type}
Role Profile:
- Panel Mode: ${session.roleProfile.panelMode}
- Role Domain: ${session.roleProfile.roleDomainLabel}
- Core Skills Label: ${session.roleProfile.coreSkillsLabel}
Resume Highlights: ${session.candidateContext.resumeHighlights.join(" | ")}
Target Skills: ${session.candidateContext.targetSkills.join(" | ")}
Experience Gaps: ${session.candidateContext.experienceGaps.join(" | ")}
${memorySection}
Interview Transcript Summary:
${roundsSummary}

Generate the final debrief report. Output JSON only.`;

  const raw = await callNemotron(REPORT_SYSTEM, userMessage, 0.4, 900, "Reporter");
  return parseJSON<Report>(raw);
}

type PanelResponse = Record<InterviewerId, Partial<Persona>>;

export async function generateInterviewers(
  role: string,
  company: string,
  interviewType: InterviewType,
  jobDescription: string,
  resume: string,
  roleProfile: RoleProfile,
): Promise<Persona[]> {
  const practitionerTitle = fallbackTitleForInterviewer("practitioner", role, roleProfile);
  const hiringManagerTitle = fallbackTitleForInterviewer("hiring_manager", role, roleProfile);
  const recruiterTitle = fallbackTitleForInterviewer("recruiter", role, roleProfile);

  const raw = await callNemotron(
    `You generate a realistic 3-person interview panel for mock interviews.

Output ONLY valid JSON with exactly these keys and no markdown:
{
  "practitioner": {
    "name": "<realistic first name>",
    "title": "<realistic role-specific title such as ${practitionerTitle}>",
    "company": "${company}",
    "years": <integer 6-18>,
    "personality": "<2-4 adjective phrase>",
    "focus": "<what this interviewer focuses on>"
  },
  "hiring_manager": {
    "name": "<realistic first name>",
    "title": "<realistic manager title such as ${hiringManagerTitle}>",
    "company": "${company}",
    "years": <integer 6-18>,
    "personality": "<2-4 adjective phrase>",
    "focus": "<what this interviewer focuses on>"
  },
  "recruiter": {
    "name": "<realistic first name>",
    "title": "<recruiter title such as ${recruiterTitle}>",
    "company": "${company}",
    "years": <integer 4-15>,
    "personality": "<2-4 adjective phrase>",
    "focus": "<what this interviewer focuses on>"
  }
}

Rules:
- The panel must feel believable for the target role.
- For non-technical jobs, do not invent engineering-flavored titles.
- Only use software-engineering titles when the role is actually software/engineering related.
- Practitioner is the domain expert for day-to-day work.
- Hiring manager owns team performance and judgment.
- Recruiter covers fit, motivation, and logistics.`,
    `Generate a panel for:
Role being interviewed for: ${role}
Company: ${company}
Interview type: ${interviewType}
Role profile:
- Panel mode: ${roleProfile.panelMode}
- Role domain: ${roleProfile.roleDomainLabel}
- Core skills label: ${roleProfile.coreSkillsLabel}

Job description summary:
${jobDescription.slice(0, 900)}

Resume summary:
${resume.slice(0, 900)}

The panel should feel like a real interview team for this candidate and role.
Output JSON only.`,
    0.8,
    320,
    "PanelGen",
  );

  const parsed = parseJSON<PanelResponse>(raw);

  return PANEL_ARCHETYPES.map((interviewerId) =>
    normalizePersona(parsed[interviewerId], interviewerId, company, role, roleProfile),
  );
}

const CLARIFY_SYSTEM = `You are deciding whether the interviewer should ask for clarification before moving on.

Output ONLY valid JSON:
{
  "needs_clarification": <boolean>,
  "follow_up": "<a natural, in-context clarification question the interviewer would actually ask>",
  "reason": "<one short sentence>"
}

needs_clarification is true when the answer is:
- too short to evaluate fairly
- clearly off-topic
- a refusal or filler response
- missing the actual substance needed for this stage

The follow_up must sound like the same interviewer continuing the conversation.
Output JSON only.`;

export type Clarification = {
  needs_clarification: boolean;
  follow_up: string;
  reason: string;
};

export async function runClarifier(
  session: Session,
  plan: Plan,
  question: string,
  answer: string,
  interviewer: Persona,
): Promise<Clarification> {
  const raw = await callNemotron(
    CLARIFY_SYSTEM,
    `Interviewer: ${interviewer.name}, ${interviewer.title}
Role Domain: ${session.roleProfile.roleDomainLabel}
Core Skills Label: ${session.roleProfile.coreSkillsLabel}
Stage: ${plan.stage}
Turn Type: ${plan.turn_type}
Focus: ${plan.focus}
Goal: ${plan.goal}
Resume Anchor: ${plan.based_on_resume ?? "none"}
Job Requirement Anchor: ${plan.based_on_job_requirement ?? "none"}

Question: ${question}
Answer: ${answer}

Decide. Output JSON only.`,
    0.2,
    180,
    "Clarifier",
  );
  return parseJSON<Clarification>(raw);
}

export function isTechnicalTopic(questionType: string) {
  return SOFTWARE_QUESTION_TYPES.has(questionType as QuestionType);
}
