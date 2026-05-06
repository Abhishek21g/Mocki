import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  deriveRoleProfile,
  generateCandidateContext,
  generateInterviewers,
  runClarifier,
  runCoordinator,
  runEvaluator,
  runInterviewer,
  runReportGenerator,
} from "./agents.server";
import { getLogs, markTurnBoundary, pushLog, withSessionLog } from "./agent-log.server";
import { createSession, getInterviewerById, getSession, updateSession } from "./sessions.server";
import { getUserIdForToken } from "./supabase.server";
import {
  buildUpdatedMemoryFromReport,
  emptyLearnerMemory,
  getLearnerMemoryForUser,
  memoryToPromptBlock,
  persistInterviewSession,
  setLearnerMemoryForUser,
  type InterviewSessionPayload,
  type LearnerMemory,
} from "./history.server";

const StartSchema = z.object({
  role: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  jobDescription: z.string().min(1).max(20000),
  interview_type: z.enum(["technical", "behavioral", "mixed"]),
  resume: z.string().min(1).max(20000),
  totalRounds: z.union([z.literal(3), z.literal(4), z.literal(6)]).default(4),
  accessToken: z.string().min(10).max(8000).optional(),
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

      const roleProfile = deriveRoleProfile(data.role, data.jobDescription, data.interview_type);
      pushLog(sessionId, {
        agent: "RoleProfile",
        phase: "info",
        message: `Role-aware framing set to ${roleProfile.roleDomainLabel}`,
        meta: roleProfile,
      });

      let userId: string | null = null;
      let learnerMemory: LearnerMemory = emptyLearnerMemory();
      let learnerMemoryPrompt: string | null = null;

      if (data.accessToken) {
        userId = await getUserIdForToken(data.accessToken);
        if (userId) {
          try {
            learnerMemory = await getLearnerMemoryForUser(data.accessToken);
          } catch (err) {
            pushLog(sessionId, {
              agent: "Memory",
              phase: "error",
              message: "Failed to load learner memory",
              meta: { error: err instanceof Error ? err.message : String(err) },
            });
          }
          learnerMemoryPrompt = memoryToPromptBlock(learnerMemory) || null;
          pushLog(sessionId, {
            agent: "Memory",
            phase: "info",
            message: learnerMemory.totalSessions
              ? `Loaded learner memory from ${learnerMemory.totalSessions} prior sessions`
              : "No prior learner memory; starting fresh for this user",
            meta: {
              totalSessions: learnerMemory.totalSessions,
              weakTopics: learnerMemory.weakTopics.slice(0, 6),
              strongTopics: learnerMemory.strongTopics.slice(0, 6),
            },
          });
        }
      }

      const candidateContext = await generateCandidateContext(
        data.role,
        data.company,
        data.resume,
        data.jobDescription,
        learnerMemoryPrompt,
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
        roleProfile,
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

      const { accessToken: _accessToken, ...persistableInput } = data;
      void _accessToken;
      await createSession(sessionId, {
        ...persistableInput,
        interviewers,
        activeInterviewerId: interviewers[0].id,
        panelType: "structured",
        roleProfile,
        candidateContext,
        totalRounds: data.totalRounds,
        currentStage: "intro",
        userId,
        learnerMemoryPrompt,
      });

      const session = (await getSession(sessionId))!;
      // Setup events above (RoleProfile, Memory, PanelGen, etc.) sit on
      // turn 0; the interview itself begins here.
      markTurnBoundary(sessionId, "Turn 1 started · opening question");
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

      await updateSession(sessionId, {
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
        roleProfile,
        round: 1,
        totalRounds: data.totalRounds,
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
    let session = await getSession(data.sessionId);
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
          await updateSession(data.sessionId, { lastClarified: true });
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
      session = await updateSession(data.sessionId, {
        rounds: updatedRounds,
        currentRound: newRoundNumber,
        currentStage: activePlan.stage,
        lastClarified: false,
      });

      if (newRoundNumber >= session.totalRounds) {
        return {
          evaluation,
          completedRound,
          done: true as const,
          round: newRoundNumber,
          clarification: false as const,
        };
      }

      // New question = new turn. Clarifications above bail out earlier
      // (no boundary), so they correctly stay on the previous turn.
      markTurnBoundary(data.sessionId, `Turn ${newRoundNumber + 1} started`);
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

      await updateSession(data.sessionId, {
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

const ReportSchema = z.object({
  sessionId: z.string().min(1).max(100),
  accessToken: z.string().min(10).max(8000).optional(),
});

export const generateReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReportSchema.parse(d))
  .handler(async ({ data }) => {
    const session = await getSession(data.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.rounds.length < session.totalRounds) throw new Error("Interview not complete");

    return await withSessionLog(data.sessionId, async () => {
      const report = await runReportGenerator(session);
      pushLog(data.sessionId, {
        agent: "Reporter",
        phase: "info",
        message: `Report ready · ${report.hire_decision}`,
      });

      const reportPayload: InterviewSessionPayload = {
        ...report,
        sessionId: data.sessionId,
        rounds: session.rounds,
        role: session.role,
        company: session.company,
        jobDescription: session.jobDescription,
        resume: session.resume,
        interviewers: session.interviewers,
        panelType: session.panelType,
        totalRounds: session.totalRounds,
        roleProfile: session.roleProfile,
      };

      let persistedId: string | null = null;
      if (data.accessToken) {
        const userId = session.userId ?? (await getUserIdForToken(data.accessToken));
        if (userId) {
          try {
            const stored = await persistInterviewSession(data.accessToken, userId, reportPayload, {
              interview_type: session.interview_type,
              roleDomainLabel: session.roleProfile.roleDomainLabel,
              coreSkillsLabel: session.roleProfile.coreSkillsLabel,
            });
            if (stored) {
              persistedId = stored.id;
              pushLog(data.sessionId, {
                agent: "History",
                phase: "info",
                message: "Saved interview to your history",
                meta: { storedId: stored.id },
              });
            }
          } catch (err) {
            pushLog(data.sessionId, {
              agent: "History",
              phase: "error",
              message: "Failed to save interview history",
              meta: { error: err instanceof Error ? err.message : String(err) },
            });
          }

          try {
            const prior = await getLearnerMemoryForUser(data.accessToken);
            const updated = buildUpdatedMemoryFromReport(prior, reportPayload);
            await setLearnerMemoryForUser(data.accessToken, userId, updated);
            pushLog(data.sessionId, {
              agent: "Memory",
              phase: "info",
              message: `Updated learner memory · ${updated.totalSessions} session(s)`,
              meta: {
                weakTopics: updated.weakTopics.slice(0, 6),
                strongTopics: updated.strongTopics.slice(0, 6),
              },
            });
          } catch (err) {
            pushLog(data.sessionId, {
              agent: "Memory",
              phase: "error",
              message: "Failed to update learner memory",
              meta: { error: err instanceof Error ? err.message : String(err) },
            });
          }
        }
      }

      return {
        ...reportPayload,
        storedSessionId: persistedId,
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
