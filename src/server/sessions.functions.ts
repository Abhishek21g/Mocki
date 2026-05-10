import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdminClient, getUserIdForToken } from "./supabase.server";
import type { InterviewStage, Plan, Persona, Round, RoleProfile, Session } from "./sessions.server";
import type { ViewerSession } from "@/components/agent-dashboard/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AbandonedSession = {
  sessionId: string;
  role: string;
  company: string;
  currentRound: number;
  totalRounds: number;
  lastQuestion: string | null;
  currentStage: InterviewStage;
  createdAt: string;
};

export type ResumedSession = {
  sessionId: string;
  currentQuestion: string | null;
  /** 1-indexed round number for ghost-store (= session.currentRound + 1) */
  currentRound: number;
  totalRounds: number;
  role: string;
  company: string;
  interview_type: string;
  interviewers: Persona[];
  activeInterviewer: Persona;
  currentStage: InterviewStage;
  lastPlan: Plan | null;
  rounds: Round[];
  roleProfile: RoleProfile;
  jobDescription: string;
  resume: string;
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TokenSchema = z.object({ accessToken: z.string().min(10).max(8000) });
const ResumeSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  sessionId: z.string().min(1).max(100),
});

// ---------------------------------------------------------------------------
// getAbandonedSessions
// ---------------------------------------------------------------------------

export const getAbandonedSessions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: true as const, sessions: [] as AbandonedSession[] };

    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { ok: true as const, sessions: [] as AbandonedSession[] };

    const { data: rows, error } = await admin
      .from("session_store")
      .select("id, data, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !rows) return { ok: true as const, sessions: [] as AbandonedSession[] };

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const abandoned: AbandonedSession[] = rows
      .filter((row) => {
        const d = row.data as Session;
        return (
          typeof d?.currentRound === "number" &&
          typeof d?.totalRounds === "number" &&
          d.currentRound > 0 &&
          d.currentRound < d.totalRounds &&
          (row.created_at as string) < fiveMinutesAgo
        );
      })
      .slice(0, 3)
      .map((row) => {
        const d = row.data as Session;
        return {
          sessionId: row.id as string,
          role: d.role,
          company: d.company,
          currentRound: d.currentRound,
          totalRounds: d.totalRounds,
          lastQuestion: d.lastQuestion,
          currentStage: d.currentStage,
          createdAt: row.created_at as string,
        };
      });

    return { ok: true as const, sessions: abandoned };
  });

// ---------------------------------------------------------------------------
// resumeInterview
// ---------------------------------------------------------------------------

export const resumeInterview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResumeSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false as const, reason: "admin_unavailable" as string, session: null };

    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { ok: false as const, reason: "unauthorized" as string, session: null };

    const { data: row, error } = await admin
      .from("session_store")
      .select("id, data, user_id")
      .eq("id", data.sessionId)
      .single();

    if (error || !row) return { ok: false as const, reason: "not_found" as string, session: null };
    if ((row.user_id as string) !== userId) {
      return { ok: false as const, reason: "unauthorized" as string, session: null };
    }

    const session = row.data as Session;
    const activeInterviewer =
      session.interviewers.find((p) => p.id === session.activeInterviewerId) ??
      session.interviewers[0];

    const resumed: ResumedSession = {
      sessionId: data.sessionId,
      currentQuestion: session.lastQuestion,
      currentRound: session.currentRound + 1,
      totalRounds: session.totalRounds,
      role: session.role,
      company: session.company,
      interview_type: session.interview_type,
      interviewers: session.interviewers,
      activeInterviewer,
      currentStage: session.currentStage,
      lastPlan: session.lastPlan,
      rounds: session.rounds,
      roleProfile: session.roleProfile,
      jobDescription: session.jobDescription,
      resume: session.resume,
    };

    return { ok: true as const, reason: null, session: resumed };
  });

// ---------------------------------------------------------------------------
// getSessionForViewer
// ---------------------------------------------------------------------------

const ViewerSchema = z.object({
  sessionId: z.string().min(8).max(80),
});

export const getSessionForViewer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ViewerSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false as const, session: null };

    const { data: row, error } = await admin
      .from("session_store")
      .select("data")
      .eq("id", data.sessionId)
      .single();

    if (error || !row) return { ok: false as const, session: null };

    const s = row.data as Session;

    const session: ViewerSession = {
      role: s.role,
      company: s.company,
      interview_type: s.interview_type,
      currentRound: s.currentRound,
      totalRounds: s.totalRounds,
      activeInterviewerId: s.activeInterviewerId ?? null,
      interviewers: s.interviewers.map((iv) => ({
        id: iv.id,
        name: iv.name,
        title: iv.title,
        personality: iv.personality,
        focus: iv.focus,
      })),
      currentStage: s.currentStage,
      currentFocus: s.lastPlan?.focus ?? "",
      currentDifficulty: s.lastPlan?.difficulty ?? "",
      currentCoordinatorReason: s.lastPlan?.reason ?? "",
      currentTurnType: s.lastPlan?.turn_type ?? "",
      lastQuestion: s.lastQuestion,
      rounds: s.rounds.map((r) => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        interviewerName: r.interviewerName,
        interviewerId: r.interviewerId,
        stage: r.stage,
        turnType: r.turnType,
        evaluation: {
          overall: r.evaluation.overall,
          answer_summary: r.evaluation.answer_summary,
          strengths: r.evaluation.strengths,
          weaknesses: r.evaluation.weaknesses,
        },
      })),
    };

    return { ok: true as const, session };
  });
