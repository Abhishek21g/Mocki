import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSession, getSession, updateSession } from "./sessions.server";
import { generatePersona, runCoordinator, runInterviewer, runEvaluator, runReportGenerator, runClarifier } from "./agents.server";
import { withSessionLog, getLogs, pushLog } from "./agent-log.server";

const StartSchema = z.object({
  role: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  interview_type: z.enum(["technical", "behavioral", "mixed"]),
  resume: z.string().min(1).max(20000),
});

export const startInterview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StartSchema.parse(d))
  .handler(async ({ data }) => {
    const sessionId = crypto.randomUUID();
    return await withSessionLog(sessionId, async () => {
      pushLog(sessionId, { agent: "System", phase: "info", message: `New session for ${data.role} @ ${data.company} (${data.interview_type})` });
      const persona = await generatePersona(data.role, data.company, data.interview_type);
      createSession(sessionId, { ...data, persona });
      pushLog(sessionId, { agent: "PersonaGen", phase: "info", message: `Interviewer: ${persona.name}, ${persona.title}` });
      const session = getSession(sessionId)!;
      const plan = await runCoordinator(session);
      pushLog(sessionId, { agent: "Coordinator", phase: "info", message: `Plan: ${plan.question_type} / ${plan.difficulty}`, meta: { reason: plan.reason } });
      const question = await runInterviewer(persona, plan.question_type, plan.difficulty, data.role, data.company);
      updateSession(sessionId, { lastQuestion: question, lastPlan: plan, currentRound: 0, lastClarified: false });
      return {
        sessionId,
        question,
        interviewer: persona,
        round: 1,
        totalRounds: 5,
        topic: plan.question_type.replace(/_/g, " "),
        difficulty: plan.difficulty,
      };
    });
  });

const AnswerSchema = z.object({
  sessionId: z.string().min(1).max(100),
  answer: z.string().min(1).max(20000),
});

export const submitAnswer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AnswerSchema.parse(d))
  .handler(async ({ data }) => {
    let session = getSession(data.sessionId);
    if (!session) throw new Error("Session not found");

    return await withSessionLog(data.sessionId, async () => {
      // Step 1: clarification check (only once per question)
      if (!session!.lastClarified) {
        const clar = await runClarifier(session!.lastQuestion!, data.answer);
        if (clar.needs_clarification && clar.follow_up) {
          pushLog(data.sessionId, { agent: "Clarifier", phase: "info", message: "Answer too vague — asking follow-up", meta: { reason: clar.reason } });
          updateSession(data.sessionId, { lastClarified: true });
          return {
            clarification: true as const,
            follow_up: clar.follow_up,
            done: false as const,
            round: session!.currentRound + 1,
          };
        }
      }

      // Step 2: evaluate
      const evaluation = await runEvaluator(session!.lastQuestion!, data.answer);
      pushLog(data.sessionId, { agent: "Evaluator", phase: "info", message: `Overall ${evaluation.overall}/10` });
      const completedRound = {
        question: session!.lastQuestion!,
        answer: data.answer,
        evaluation,
        topic: session!.lastPlan?.question_type?.replace(/_/g, " ") ?? "General",
        difficulty: session!.lastPlan?.difficulty ?? "medium",
      };
      const updatedRounds = [...session!.rounds, completedRound];
      const newRoundNumber = session!.currentRound + 1;
      updateSession(data.sessionId, { rounds: updatedRounds, currentRound: newRoundNumber, lastClarified: false });
      session = getSession(data.sessionId)!;

      if (newRoundNumber >= 5) {
        return { evaluation, done: true as const, round: newRoundNumber, clarification: false as const };
      }
      const plan = await runCoordinator(session);
      pushLog(data.sessionId, { agent: "Coordinator", phase: "info", message: `Next: ${plan.question_type} / ${plan.difficulty}`, meta: { reason: plan.reason } });
      const nextQuestion = await runInterviewer(session.persona, plan.question_type, plan.difficulty, session.role, session.company);
      updateSession(data.sessionId, { lastQuestion: nextQuestion, lastPlan: plan });
      return {
        evaluation,
        next_question: nextQuestion,
        topic: plan.question_type.replace(/_/g, " "),
        difficulty: plan.difficulty,
        round: newRoundNumber + 1,
        done: false as const,
        clarification: false as const,
      };
    });
  });

const ReportSchema = z.object({ sessionId: z.string().min(1).max(100) });

export const generateReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReportSchema.parse(d))
  .handler(async ({ data }) => {
    const session = getSession(data.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.rounds.length < 5) throw new Error("Interview not complete");
    return await withSessionLog(data.sessionId, async () => {
      const report = await runReportGenerator(session);
      pushLog(data.sessionId, { agent: "Reporter", phase: "info", message: `Report ready · ${report.hire_decision}` });
      return { ...report, rounds: session.rounds, role: session.role, company: session.company, interviewer: session.persona };
    });
  });

const LogsSchema = z.object({ sessionId: z.string().min(1).max(100), since: z.number().optional() });

export const fetchAgentLogs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LogsSchema.parse(d))
  .handler(async ({ data }) => {
    return { events: getLogs(data.sessionId, data.since ?? 0) };
  });
