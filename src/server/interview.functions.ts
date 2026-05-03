import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  generateCandidateContext,
  generateInterviewers,
  runClarifier,
  runCoordinator,
  runEvaluator,
  runInterviewer,
  runReportGenerator,
} from "./agents.server";
import { getLogs, pushLog, withSessionLog } from "./agent-log.server";
import { createSession, getInterviewerById, getSession, updateSession } from "./sessions.server";

const TOTAL_TURNS = 6;

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

      const candidateContext = await generateCandidateContext(
        data.role,
        data.company,
        data.resume,
        data.jobDescription,
      );
      pushLog(sessionId, {
        agent: "CandidateContext",
        phase: "info",
        message: "Derived candidate context from resume and job description",
        meta: {
          resumeHighlights: candidateContext.resumeHighlights,
          targetSkills: candidateContext.targetSkills,
          experienceGaps: candidateContext.experienceGaps,
        },
      });

      const interviewers = await generateInterviewers(
        data.role,
        data.company,
        data.interview_type,
        data.jobDescription,
        data.resume,
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
        panelType: "structured",
        candidateContext,
        totalRounds: TOTAL_TURNS,
        currentStage: "intro",
      });

      const session = getSession(sessionId)!;
      const plan = await runCoordinator(session);
      const activeInterviewer = getInterviewerById(session, plan.next_interviewer_id);

      pushLog(sessionId, {
        agent: "Coordinator",
        phase: "info",
        message: `Opening with ${activeInterviewer.name} in ${plan.stage}`,
        meta: {
          interviewerId: activeInterviewer.id,
          interviewerName: activeInterviewer.name,
          stage: plan.stage,
          turnType: plan.turn_type,
          focus: plan.focus,
          goal: plan.goal,
          reason: plan.reason,
        },
      });

      const question = await runInterviewer(activeInterviewer, plan, session);
      pushLog(sessionId, {
        agent: "Interviewer",
        phase: "info",
        message: `${activeInterviewer.name} opened the interview`,
        meta: {
          interviewerId: activeInterviewer.id,
          stage: plan.stage,
          turnType: plan.turn_type,
          focus: plan.focus,
        },
      });

      updateSession(sessionId, {
        activeInterviewerId: activeInterviewer.id,
        currentStage: plan.stage,
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
        panelType: "structured" as const,
        round: 1,
        totalRounds: TOTAL_TURNS,
        stage: plan.stage,
        turnType: plan.turn_type,
        focus: plan.focus,
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
      const activeInterviewer = getInterviewerById(session!, session!.activeInterviewerId);
      const activePlan = session!.lastPlan!;

      if (!session!.lastClarified) {
        const clarification = await runClarifier(
          session!,
          activePlan,
          session!.lastQuestion!,
          data.answer,
          activeInterviewer,
        );
        if (clarification.needs_clarification && clarification.follow_up) {
          pushLog(data.sessionId, {
            agent: "Clarifier",
            phase: "info",
            message: `${activeInterviewer.name} is asking for clarification`,
            meta: {
              stage: activePlan.stage,
              reason: clarification.reason,
            },
          });
          updateSession(data.sessionId, { lastClarified: true });
          return {
            clarification: true as const,
            follow_up: clarification.follow_up,
            done: false as const,
            round: session!.currentRound + 1,
          };
        }
      }

      const evaluation = await runEvaluator(
        session!.lastQuestion!,
        data.answer,
        session!,
        activePlan,
        activeInterviewer,
      );

      pushLog(data.sessionId, {
        agent: "Evaluator",
        phase: "info",
        message: `Scored ${evaluation.overall}/10 for ${activeInterviewer.name}'s turn`,
        meta: {
          summary: evaluation.answer_summary,
          followUpTopics: evaluation.follow_up_topics,
          unresolvedFollowUps: evaluation.unresolved_follow_ups,
        },
      });

      const completedRound = {
        id: crypto.randomUUID(),
        question: session!.lastQuestion!,
        answer: data.answer,
        evaluation,
        topic: activePlan.focus,
        difficulty: activePlan.difficulty,
        interviewerId: activeInterviewer.id,
        interviewerName: activeInterviewer.name,
        coordinatorReason: activePlan.reason,
        stage: activePlan.stage,
        turnType: activePlan.turn_type,
        goal: activePlan.goal,
        basedOnResume: activePlan.based_on_resume,
        basedOnJobRequirement: activePlan.based_on_job_requirement,
        followUpToRoundId: activePlan.follow_up_to_round_id,
      };

      const updatedRounds = [...session!.rounds, completedRound];
      const newRoundNumber = session!.currentRound + 1;
      updateSession(data.sessionId, {
        rounds: updatedRounds,
        currentRound: newRoundNumber,
        currentStage: activePlan.stage,
        lastClarified: false,
      });
      session = getSession(data.sessionId)!;

      if (newRoundNumber >= session.totalRounds) {
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
        message: `Next move: ${plan.stage} with ${nextInterviewer.name}`,
        meta: {
          interviewerId: nextInterviewer.id,
          interviewerName: nextInterviewer.name,
          stage: plan.stage,
          turnType: plan.turn_type,
          focus: plan.focus,
          goal: plan.goal,
          reason: plan.reason,
        },
      });

      const nextQuestion = await runInterviewer(nextInterviewer, plan, session);
      pushLog(data.sessionId, {
        agent: "Interviewer",
        phase: "info",
        message: `${nextInterviewer.name} delivered the next turn`,
        meta: {
          interviewerId: nextInterviewer.id,
          stage: plan.stage,
          turnType: plan.turn_type,
          focus: plan.focus,
        },
      });

      updateSession(data.sessionId, {
        activeInterviewerId: nextInterviewer.id,
        currentStage: plan.stage,
        lastQuestion: nextQuestion,
        lastPlan: plan,
      });

      return {
        evaluation,
        completedRound,
        next_question: nextQuestion,
        nextInterviewer,
        stage: plan.stage,
        turnType: plan.turn_type,
        focus: plan.focus,
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
    if (session.rounds.length < session.totalRounds) throw new Error("Interview not complete");

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
        totalRounds: session.totalRounds,
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
