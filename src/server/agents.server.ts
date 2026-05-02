import { callNemotron, parseJSON } from "./nim.server";
import type { Persona, Plan, Evaluation, Session } from "./sessions.server";

const COORDINATOR_SYSTEM = `You are an AI interview coordinator managing the flow of a mock job interview.

You receive the job role, candidate resume summary, interview type, and history of all previous rounds with their scores.

You output ONLY valid JSON with no other text, no markdown, no explanation:
{
  "next_interviewer_type": "technical" | "behavioral",
  "question_type": "data_structures" | "algorithms" | "system_design" | "debugging" | "behavioral" | "motivation" | "past_experience" | "teamwork",
  "difficulty": "easy" | "medium" | "hard",
  "reason": "one sentence why you chose this"
}

Rules you MUST follow:
- Round 1: always medium difficulty
- If interview_type is "technical": first 4 rounds are technical, last round behavioral
- If interview_type is "behavioral": all rounds behavioral, rotate between past_experience, teamwork, motivation, behavioral
- If interview_type is "mixed": alternate technical/behavioral every round
- If last round overall score was below 5.0: decrease difficulty by one level, stay on same topic
- If last round overall score was above 8.0: increase difficulty, switch to harder topic
- Never repeat the same question_type two rounds in a row
- Always output valid JSON only`;

export async function runCoordinator(session: Session): Promise<Plan> {
  const historyText = session.rounds.length === 0
    ? "No previous rounds. This is the first question."
    : session.rounds.map((r, i) =>
        `Round ${i + 1}: Topic=${r.topic}, Difficulty=${r.difficulty}, Overall Score=${r.evaluation?.overall ?? "N/A"}, Weaknesses=${r.evaluation?.weaknesses?.join(", ") ?? "N/A"}`,
      ).join("\n");

  const userMessage = `
Job Role: ${session.role}
Company: ${session.company}
Interview Type: ${session.interview_type}
Resume Summary: ${session.resume.slice(0, 500)}
Current Round: ${session.currentRound + 1} of 5

Previous Round History:
${historyText}

Decide what the next question should be. Output JSON only.`;

  const raw = await callNemotron(COORDINATOR_SYSTEM, userMessage, 0.3, 200, "Coordinator");
  return parseJSON<Plan>(raw);
}

const interviewerSystem = (p: Persona) => `You are ${p.name}, a ${p.title} at ${p.company} with ${p.years} years of experience. You are conducting a real job interview.

Your personality: ${p.personality}

Your ONLY job right now is to ask ONE interview question. The question type is specified by the coordinator.

Rules you MUST follow:
- Sound completely human — natural, direct, conversational
- Do NOT say "Here is your question" or "Sure!" or any preamble whatsoever
- Do NOT introduce yourself
- Just ask the question exactly as you would in a real interview
- Keep it to 1-4 sentences maximum
- Do NOT give hints, do NOT tell them what you're looking for, do NOT evaluate them
- Make it feel like a real interview, not a standardized test
- Output only the question text, nothing else`;

export async function runInterviewer(persona: Persona, questionType: string, difficulty: string, role: string, company: string): Promise<string> {
  const userMessage = `Ask a ${difficulty} difficulty ${questionType} question appropriate for a ${role} candidate interviewing at ${company}. Just ask the question now.`;
  const raw = await callNemotron(interviewerSystem(persona), userMessage, 0.8, 200, "Interviewer");
  return raw.trim();
}

const EVALUATOR_SYSTEM = `You are an expert technical interview evaluator with 12 years of experience at top tech companies including Google, Meta, and Amazon.

You receive an interview question and the candidate's answer. Evaluate it strictly and honestly.

Output ONLY valid JSON with no other text, no markdown, no explanation:
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

Scoring calibration — be strict:
- 9-10: Would impress a Google L5 interviewer. Near perfect. Very rare.
- 7-8: Solid answer with only minor gaps. Above average candidate.
- 5-6: Basic understanding present but lacks depth, precision, or completeness.
- 3-4: Partial understanding. Significant conceptual gaps.
- 1-2: Fundamentally incorrect or extremely incomplete.

The average candidate scores 4.5-6.0. Reserve 8+ for genuinely excellent answers.
Output valid JSON only.`;

export async function runEvaluator(question: string, answer: string): Promise<Evaluation> {
  const userMessage = `Interview Question: ${question}\n\nCandidate's Answer: ${answer}\n\nEvaluate this answer. Output JSON only.`;
  const raw = await callNemotron(EVALUATOR_SYSTEM, userMessage, 0.2, 400, "Evaluator");
  return parseJSON<Evaluation>(raw);
}

const REPORT_SYSTEM = `You are generating a comprehensive final debrief report for a mock job interview session.

Output ONLY valid JSON with no other text, no markdown:
{
  "overall_score": <float 1.0-10.0 one decimal, weighted average of all overall scores>,
  "hire_decision": "strong yes" | "yes" | "lean yes" | "maybe" | "lean no" | "no" | "strong no",
  "strengths": [<string>, <string>, <string>],
  "weaknesses": [<string>, <string>, <string>],
  "drill_questions": [<string>, <string>, <string>],
  "study_plan": <string, 4-5 sentences of highly personalized actionable advice written like a mentor, not an AI>
}

hire_decision thresholds:
- overall >= 8.5: "strong yes"
- overall >= 7.5: "yes"
- overall >= 6.5: "lean yes"
- overall >= 5.5: "maybe"
- overall >= 4.5: "lean no"
- overall >= 3.5: "no"
- overall < 3.5: "strong no"

drill_questions: 3 highly specific practice questions targeting the exact weaknesses.
study_plan: sound like a real senior engineer mentor. Reference specific weak areas. Concrete 1-week plan.
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
  const roundsSummary = session.rounds.map((r, i) => `
Round ${i + 1}:
  Question: ${r.question}
  Answer: ${r.answer}
  Scores: clarity=${r.evaluation.clarity}, technical_depth=${r.evaluation.technical_depth}, structure=${r.evaluation.structure}, overall=${r.evaluation.overall}
  Strengths: ${r.evaluation.strengths?.join(", ")}
  Weaknesses: ${r.evaluation.weaknesses?.join(", ")}
  Missed: ${r.evaluation.missed_concepts?.join(", ")}`).join("\n");

  const userMessage = `
Job Role: ${session.role} at ${session.company}
Interview Type: ${session.interview_type}
Resume: ${session.resume.slice(0, 400)}

All 5 Rounds:
${roundsSummary}

Generate the final debrief report. Output JSON only.`;

  const raw = await callNemotron(REPORT_SYSTEM, userMessage, 0.4, 800, "Reporter");
  return parseJSON<Report>(raw);
}

export async function generatePersona(role: string, company: string, interviewType: string): Promise<Persona> {
  const raw = await callNemotron(
    "You generate realistic interviewer personas for mock interviews. Output ONLY valid JSON, no other text.",
    `Generate an interviewer persona for this mock interview:
Role being interviewed for: ${role}
Company: ${company}
Interview type: ${interviewType}

Output JSON:
{
  "name": "<realistic first name>",
  "title": "<realistic job title matching the interview type and company>",
  "company": "${company}",
  "years": <integer 4-15>,
  "personality": "<2-3 adjective phrase describing interview style>"
}
Output valid JSON only.`,
    0.9,
    150,
    "PersonaGen",
  );
  return parseJSON<Persona>(raw);
}

const CLARIFY_SYSTEM = `You are a triage agent that decides if a candidate's interview answer is too vague, off-topic, dismissive, or low-effort to be evaluated fairly.

Output ONLY valid JSON, no markdown:
{
  "needs_clarification": <boolean>,
  "follow_up": "<a single, short, human follow-up question the interviewer would say to nudge the candidate (e.g. 'Could you walk me through your reasoning a bit more?'). Empty string if not needed.>",
  "reason": "<one short sentence>"
}

needs_clarification = true when the answer is:
- under ~15 meaningful words AND not a direct correct answer
- gibberish, "idk", "no idea", "skip", random characters
- completely off-topic relative to the question
- a pure refusal

Otherwise false. Output JSON only.`;

export type Clarification = { needs_clarification: boolean; follow_up: string; reason: string };

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
