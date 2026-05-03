import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  generateInterviewers,
  runClarifier,
  runCoordinator,
  runEvaluator,
  runInterviewer,
  runReportGenerator,
} from "./agents.server";
import { getLogs, pushLog, withSessionLog } from "./agent-log.server";
import { createSession, getInterviewerById, getSession, updateSession } from "./sessions.server";

const StartSchema = z.object({
  role: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  jobDescription: z.string().min(1).max(20000),
  interview_type: z.enum(["technical", "behavioral", "mixed"]),
  resume: z.string().min(1).max(20000),
});

export const startInterview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StartSchema.parse(d))
  .handler(async ({ data }) => {
    const sessionId = crypto.randomUUID();
    return await withSessionLog(sessionId, async () => {
      pushLog(sessionId, {
        agent: "System",
        phase: "info",
        message: `New session for ${data.role} @ ${data.company} (${data.interview_type})`,
      });

      const interviewers = await generateInterviewers(
        data.role,
        data.company,
        data.interview_type,
        data.jobDescription,
      );
      interviewers.forEach((persona) => {
        pushLog(sessionId, {
          agent: "PanelGen",
          phase: "info",
          message: `${persona.name} joined the panel as ${persona.title}`,
          meta: {
            interviewerId: persona.id,
            focus: persona.focus,
            personality: persona.personality,
          },
        });
      });

      createSession(sessionId, {
        ...data,
        interviewers,
        activeInterviewerId: interviewers[0].id,
        panelType: "standard",
      });

      const session = getSession(sessionId)!;
      const plan = await runCoordinator(session);
      const activeInterviewer = getInterviewerById(session, plan.next_interviewer_id);

      pushLog(sessionId, {
        agent: "Coordinator",
        phase: "info",
        message: `Opening with ${activeInterviewer.name} on ${plan.question_type}`,
        meta: {
          interviewerId: activeInterviewer.id,
          interviewerName: activeInterviewer.name,
          difficulty: plan.difficulty,
          reason: plan.reason,
        },
      });

      const question = await runInterviewer(
        activeInterviewer,
        plan.question_type,
        plan.difficulty,
        data.role,
        data.company,
        data.jobDescription,
      );

      pushLog(sessionId, {
        agent: "Interviewer",
        phase: "info",
        message: `${activeInterviewer.name} is asking the opening question`,
        meta: {
          interviewerId: activeInterviewer.id,
          questionType: plan.question_type,
          difficulty: plan.difficulty,
        },
      });

      updateSession(sessionId, {
        activeInterviewerId: activeInterviewer.id,
        lastQuestion: question,
        lastPlan: plan,
        currentRound: 0,
        lastClarified: false,
      });

      return {
        sessionId,
        question,
        interviewers,
        activeInterviewer,
        panelType: "standard" as const,
        round: 1,
        totalRounds: 5,
        topic: plan.question_type.replace(/_/g, " "),
        difficulty: plan.difficulty,
        coordinatorReason: plan.reason,
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
      if (!session!.lastClarified) {
        const clar = await runClarifier(session!.lastQuestion!, data.answer);
        if (clar.needs_clarification && clar.follow_up) {
          pushLog(data.sessionId, {
            agent: "Clarifier",
            phase: "info",
            message: "Answer too vague, asking a follow-up before scoring",
            meta: { reason: clar.reason },
          });
          updateSession(data.sessionId, { lastClarified: true });
          return {
            clarification: true as const,
            follow_up: clar.follow_up,
            done: false as const,
            round: session!.currentRound + 1,
          };
        }
      }

      const activeInterviewer = getInterviewerById(session!, session!.activeInterviewerId);
      const evaluation = await runEvaluator(
        session!.lastQuestion!,
        data.answer,
        session!.role,
        session!.company,
        session!.jobDescription,
      );

      pushLog(data.sessionId, {
        agent: "Evaluator",
        phase: "info",
        message: `Scored ${evaluation.overall}/10 for ${activeInterviewer.name}'s round`,
        meta: {
          strengths: evaluation.strengths,
          weaknesses: evaluation.weaknesses,
        },
      });

      const completedRound = {
        question: session!.lastQuestion!,
        answer: data.answer,
        evaluation,
        topic: session!.lastPlan?.question_type?.replace(/_/g, " ") ?? "general",
        difficulty: session!.lastPlan?.difficulty ?? "medium",
        interviewerId: activeInterviewer.id,
        interviewerName: activeInterviewer.name,
        coordinatorReason:
          session!.lastPlan?.reason ?? `Selected ${activeInterviewer.name} for this round.`,
      };

      const updatedRounds = [...session!.rounds, completedRound];
      const newRoundNumber = session!.currentRound + 1;
      updateSession(data.sessionId, {
        rounds: updatedRounds,
        currentRound: newRoundNumber,
        lastClarified: false,
      });
      session = getSession(data.sessionId)!;

      if (newRoundNumber >= 5) {
        return {
          evaluation,
          completedRound,
          done: true as const,
          round: newRoundNumber,
          clarification: false as const,
        };
      }

      const plan = await runCoordinator(session);
      const nextInterviewer = getInterviewerById(session, plan.next_interviewer_id);
      pushLog(data.sessionId, {
        agent: "Coordinator",
        phase: "info",
        message: `Next up: ${nextInterviewer.name} on ${plan.question_type}`,
        meta: {
          interviewerId: nextInterviewer.id,
          interviewerName: nextInterviewer.name,
          difficulty: plan.difficulty,
          reason: plan.reason,
        },
      });

      const nextQuestion = await runInterviewer(
        nextInterviewer,
        plan.question_type,
        plan.difficulty,
        session.role,
        session.company,
        session.jobDescription,
      );
      pushLog(data.sessionId, {
        agent: "Interviewer",
        phase: "info",
        message: `${nextInterviewer.name} is asking the next question`,
        meta: {
          interviewerId: nextInterviewer.id,
          questionType: plan.question_type,
          difficulty: plan.difficulty,
        },
      });

      updateSession(data.sessionId, {
        activeInterviewerId: nextInterviewer.id,
        lastQuestion: nextQuestion,
        lastPlan: plan,
      });

      return {
        evaluation,
        completedRound,
        next_question: nextQuestion,
        nextInterviewer,
        topic: plan.question_type.replace(/_/g, " "),
        difficulty: plan.difficulty,
        coordinatorReason: plan.reason,
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
      pushLog(data.sessionId, {
        agent: "Reporter",
        phase: "info",
        message: `Report ready · ${report.hire_decision}`,
      });
      return {
        ...report,
        rounds: session.rounds,
        role: session.role,
        company: session.company,
        jobDescription: session.jobDescription,
        interviewers: session.interviewers,
        panelType: session.panelType,
      };
    });
  });

const LogsSchema = z.object({
  sessionId: z.string().min(1).max(100),
  since: z.number().optional(),
});

export const fetchAgentLogs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LogsSchema.parse(d))
  .handler(async ({ data }) => {
    return { events: getLogs(data.sessionId, data.since ?? 0) };
  });
