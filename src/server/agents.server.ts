import { callNemotron, parseJSON } from "./nim.server";
import type {
  Difficulty,
  Evaluation,
  InterviewType,
  InterviewerId,
  Persona,
  Plan,
  Session,
} from "./sessions.server";

const INTERVIEWER_BLUEPRINTS: Record<
  InterviewerId,
  {
    fallbackName: string;
    fallbackTitle: string;
    focus: string;
    brief: string;
  }
> = {
  senior_engineer: {
    fallbackName: "Maya",
    fallbackTitle: "Senior Software Engineer",
    focus: "technical depth, tradeoffs, debugging, and system thinking",
    brief: "Pushes on algorithms, architecture choices, and implementation tradeoffs.",
  },
  hiring_manager: {
    fallbackName: "Jordan",
    fallbackTitle: "Engineering Manager",
    focus: "behavioral depth, ownership, teamwork, and decision-making",
    brief: "Tests collaboration, prioritization, and leadership signals.",
  },
  recruiter: {
    fallbackName: "Avery",
    fallbackTitle: "Technical Recruiter",
    focus: "candidate motivation, role fit, and resume storytelling",
    brief: "Covers motivation, communication clarity, and resume alignment.",
  },
};

const TECHNICAL_TOPICS = new Set(["data_structures", "algorithms", "system_design", "debugging"]);

const COORDINATOR_SYSTEM = `You are the coordinator for a mock panel interview.

You manage the flow between three interviewer personas:
- senior_engineer: focuses on technical depth, debugging, and tradeoffs
- hiring_manager: focuses on behavioral depth, teamwork, and ownership
- recruiter: focuses on motivation, fit, and resume storytelling

You receive the role, company, job description, resume summary, panel roster, interview type, and the history of completed rounds.

Output ONLY valid JSON with no other text:
{
  "next_interviewer_id": "senior_engineer" | "hiring_manager" | "recruiter",
  "question_type": "data_structures" | "algorithms" | "system_design" | "debugging" | "behavioral" | "motivation" | "past_experience" | "teamwork",
  "difficulty": "easy" | "medium" | "hard",
  "reason": "one concise sentence explaining the choice"
}

Rules:
- Round 1 is always medium difficulty.
- If interview_type is "technical": first 4 rounds should be technical, final round should be behavioral or motivation-focused.
- If interview_type is "behavioral": all rounds should be behavioral, teamwork, motivation, or past_experience.
- If interview_type is "mixed": alternate between technical and behavioral families when possible.
- Use senior_engineer for technical topics unless there is a strong reason not to.
- Use hiring_manager for behavioral, teamwork, and ownership-style questions.
- Use recruiter for motivation, resume walkthrough, and company-fit questions.
- If the last round overall score was below 5.0, decrease difficulty by one level and stay close to the weak area.
- If the last round overall score was above 8.0, you may increase difficulty or broaden the topic.
- Never repeat the same question_type two rounds in a row.
- Prefer not to repeat the same interviewer twice in a row unless the last answer clearly needs a deeper follow-up.
- Keep the reason concrete and useful for a demo trace.
- Output valid JSON only.`;

function sanitizeInterviewerId(value: unknown): InterviewerId | null {
  if (value === "senior_engineer" || value === "hiring_manager" || value === "recruiter") {
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

function defaultQuestionTypeFor(interviewType: InterviewType, roundNumber: number): string {
  if (interviewType === "behavioral") {
    const topics = ["past_experience", "teamwork", "motivation", "behavioral"];
    return topics[(roundNumber - 1) % topics.length];
  }
  if (interviewType === "mixed") {
    return roundNumber % 2 === 1 ? "algorithms" : "teamwork";
  }
  if (roundNumber >= 5) {
    return "behavioral";
  }
  return "algorithms";
}

function defaultInterviewerFor(questionType: string): InterviewerId {
  if (questionType === "motivation") return "recruiter";
  if (
    questionType === "behavioral" ||
    questionType === "past_experience" ||
    questionType === "teamwork"
  ) {
    return "hiring_manager";
  }
  return "senior_engineer";
}

function humanizeInterviewerId(interviewerId: InterviewerId) {
  return interviewerId.replace(/_/g, " ");
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

function normalizePersona(raw: unknown, interviewerId: InterviewerId, company: string): Persona {
  const defaults = INTERVIEWER_BLUEPRINTS[interviewerId];
  const value = (raw ?? {}) as Partial<Persona>;
  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.trim()
      : `${defaults.fallbackTitle} @ ${company}`;

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
    focus:
      typeof value.focus === "string" && value.focus.trim() ? value.focus.trim() : defaults.focus,
  };
}

export async function runCoordinator(session: Session): Promise<Plan> {
  const historyText =
    session.rounds.length === 0
      ? "No previous rounds. This is the first question."
      : session.rounds
          .map(
            (round, index) =>
              `Round ${index + 1}: Interviewer=${round.interviewerName} (${round.interviewerId}), Topic=${round.topic}, Difficulty=${round.difficulty}, Overall=${round.evaluation.overall}, Weaknesses=${round.evaluation.weaknesses.join(", ")}, Reason=${round.coordinatorReason}`,
          )
          .join("\n");

  const interviewerRoster = session.interviewers
    .map(
      (persona) =>
        `- ${persona.id}: ${persona.name}, ${persona.title}, focus=${persona.focus}, personality=${persona.personality}`,
    )
    .join("\n");

  const userMessage = `
Job Role: ${session.role}
Company: ${session.company}
Interview Type: ${session.interview_type}
Job Description Summary: ${session.jobDescription.slice(0, 700)}
Resume Summary: ${session.resume.slice(0, 500)}
Current Round: ${session.currentRound + 1} of 5
Current Active Interviewer: ${session.activeInterviewerId}

Panel Roster:
${interviewerRoster}

Previous Round History:
${historyText}

Decide the next interviewer and question. Output JSON only.`;

  const raw = await callNemotron(COORDINATOR_SYSTEM, userMessage, 0.3, 260, "Coordinator");
  const parsed = parseJSON<Partial<Plan>>(raw);
  const roundNumber = session.currentRound + 1;
  const questionType =
    typeof parsed.question_type === "string" && parsed.question_type.trim()
      ? parsed.question_type.trim()
      : defaultQuestionTypeFor(session.interview_type, roundNumber);
  const nextInterviewerId =
    sanitizeInterviewerId(parsed.next_interviewer_id) ?? defaultInterviewerFor(questionType);

  return {
    next_interviewer_id: nextInterviewerId,
    question_type: questionType,
    difficulty: sanitizeDifficulty(parsed.difficulty),
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason
            .trim()
            .replaceAll("senior_engineer", "senior engineer")
            .replaceAll("hiring_manager", "hiring manager")
            .replaceAll("recruiter", "recruiter")
        : `Selected ${humanizeInterviewerId(
            nextInterviewerId,
          )} to cover ${questionType.replace(/_/g, " ")}.`,
  };
}

const interviewerSystem = (
  persona: Persona,
) => `You are ${persona.name}, a ${persona.title} at ${persona.company} with ${persona.years} years of experience. You are one of three interviewers on a mock hiring panel.

Your personality: ${persona.personality}
Your focus: ${persona.focus}

Your only job right now is to ask ONE interview question chosen by the coordinator.

Rules:
- Sound human, direct, and realistic.
- Do not introduce yourself or explain the interview format.
- Do not say "here is your question" or add filler.
- Ask only the question text, 1-4 sentences maximum.
- Do not evaluate, hint, coach, or give sample answers.
- Make the question feel like it comes from your role on the panel.
- Output only the question text.`;

export async function runInterviewer(
  persona: Persona,
  questionType: string,
  difficulty: Difficulty,
  role: string,
  company: string,
  jobDescription: string,
): Promise<string> {
  const userMessage = `Ask a ${difficulty} difficulty ${questionType} question for a ${role} candidate interviewing at ${company}.

Job Description Summary:
${jobDescription.slice(0, 800)}

Lean into this panelist's perspective and ask the question now.`;
  const raw = await callNemotron(interviewerSystem(persona), userMessage, 0.8, 220, "Interviewer");
  return cleanQuestionText(raw);
}

const EVALUATOR_SYSTEM = `You are an expert interview evaluator.

You receive the job context, interview question, and candidate answer. Evaluate it strictly and honestly.

Output ONLY valid JSON with no other text:
{
  "clarity": <integer 1-10>,
  "technical_depth": <integer 1-10>,
  "structure": <integer 1-10>,
  "overall": <float 1.0-10.0 with one decimal>,
  "strengths": [<string>, <string>],
  "weaknesses": [<string>, <string>, <string>],
  "correct": <boolean>,
  "missed_concepts": [<string>, <string>]
}

Scoring calibration:
- 9-10: genuinely exceptional answer
- 7-8: strong answer with minor gaps
- 5-6: partial but workable answer
- 3-4: significant gaps
- 1-2: fundamentally weak or incorrect

The average candidate should land around 4.5-6.0. Output JSON only.`;

export async function runEvaluator(
  question: string,
  answer: string,
  role: string,
  company: string,
  jobDescription: string,
): Promise<Evaluation> {
  const userMessage = `Role: ${role}
Company: ${company}
Job Description Summary: ${jobDescription.slice(0, 500)}

Interview Question: ${question}

Candidate Answer: ${answer}

Evaluate this answer. Output JSON only.`;
  const raw = await callNemotron(EVALUATOR_SYSTEM, userMessage, 0.2, 420, "Evaluator");
  return parseJSON<Evaluation>(raw);
}

const REPORT_SYSTEM = `You are generating a final debrief report for a panel mock interview.

Output ONLY valid JSON with no other text:
{
  "overall_score": <float 1.0-10.0 one decimal>,
  "hire_decision": "strong yes" | "yes" | "lean yes" | "maybe" | "lean no" | "no" | "strong no",
  "strengths": [<string>, <string>, <string>],
  "weaknesses": [<string>, <string>, <string>],
  "drill_questions": [<string>, <string>, <string>],
  "study_plan": <string, 4-5 sentences>
}

Use the round data, interviewer shifts, and recurring weaknesses to generate a convincing debrief.
Output valid JSON only.`;

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
Round ${index + 1}:
  Interviewer: ${round.interviewerName} (${round.interviewerId})
  Topic: ${round.topic}
  Difficulty: ${round.difficulty}
  Coordinator Reason: ${round.coordinatorReason}
  Question: ${round.question}
  Answer: ${round.answer}
  Scores: clarity=${round.evaluation.clarity}, technical_depth=${round.evaluation.technical_depth}, structure=${round.evaluation.structure}, overall=${round.evaluation.overall}
  Strengths: ${round.evaluation.strengths.join(", ")}
  Weaknesses: ${round.evaluation.weaknesses.join(", ")}
  Missed: ${round.evaluation.missed_concepts.join(", ")}`,
    )
    .join("\n");

  const panelSummary = session.interviewers
    .map((persona) => `${persona.name} (${persona.id}) - ${persona.focus}`)
    .join("\n");

  const userMessage = `
Job Role: ${session.role} at ${session.company}
Interview Type: ${session.interview_type}
Job Description: ${session.jobDescription.slice(0, 600)}
Resume: ${session.resume.slice(0, 400)}

Panel:
${panelSummary}

All 5 Rounds:
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
): Promise<Persona[]> {
  const raw = await callNemotron(
    `You generate a realistic 3-person interview panel for mock interviews.

Output ONLY valid JSON with exactly these keys and no markdown:
{
  "senior_engineer": {
    "name": "<realistic first name>",
    "title": "<senior engineering title>",
    "company": "${company}",
    "years": <integer 6-18>,
    "personality": "<2-4 adjective phrase>",
    "focus": "<what this interviewer focuses on>"
  },
  "hiring_manager": {
    "name": "<realistic first name>",
    "title": "<engineering manager title>",
    "company": "${company}",
    "years": <integer 6-18>,
    "personality": "<2-4 adjective phrase>",
    "focus": "<what this interviewer focuses on>"
  },
  "recruiter": {
    "name": "<realistic first name>",
    "title": "<recruiter title>",
    "company": "${company}",
    "years": <integer 4-15>,
    "personality": "<2-4 adjective phrase>",
    "focus": "<what this interviewer focuses on>"
  }
}`,
    `Generate a panel for:
Role being interviewed for: ${role}
Company: ${company}
Interview type: ${interviewType}
Job description summary:
${jobDescription.slice(0, 900)}

The senior engineer should feel technical, the hiring manager should feel leadership-oriented, and the recruiter should feel candidate-facing.
Output JSON only.`,
    0.8,
    320,
    "PanelGen",
  );

  const parsed = parseJSON<PanelResponse>(raw);

  return (Object.keys(INTERVIEWER_BLUEPRINTS) as InterviewerId[]).map((interviewerId) =>
    normalizePersona(parsed[interviewerId], interviewerId, company),
  );
}

const CLARIFY_SYSTEM = `You are a triage agent that decides if a candidate's interview answer is too vague, off-topic, dismissive, or low-effort to be evaluated fairly.

Output ONLY valid JSON with no markdown:
{
  "needs_clarification": <boolean>,
  "follow_up": "<a short human follow-up question the interviewer would ask>",
  "reason": "<one short sentence>"
}

needs_clarification is true when the answer is:
- under ~15 meaningful words and not a direct correct answer
- gibberish, "idk", "no idea", "skip", or random characters
- completely off-topic relative to the question
- a pure refusal

Otherwise false. Output JSON only.`;

export type Clarification = {
  needs_clarification: boolean;
  follow_up: string;
  reason: string;
};

export async function runClarifier(question: string, answer: string): Promise<Clarification> {
  const raw = await callNemotron(
    CLARIFY_SYSTEM,
    `Question: ${question}\n\nAnswer: ${answer}\n\nDecide. Output JSON only.`,
    0.2,
    150,
    "Clarifier",
  );
  return parseJSON<Clarification>(raw);
}

export function isTechnicalTopic(questionType: string) {
  return TECHNICAL_TOPICS.has(questionType);
}
