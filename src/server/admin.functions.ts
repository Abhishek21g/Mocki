import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdminClient, getUserIdForToken } from "./supabase.server";
import type { InterviewSessionPayload } from "./history.server";

const ADMIN_EMAIL = "enaguthiabhishek@gmail.com";

const TokenSchema = z.object({ accessToken: z.string().min(10).max(8000) });
const SessionDetailSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  sessionId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HireBreakdown = Record<string, number>;
export type TopEntry = { name: string; count: number };

export type AdminRoundSummary = {
  index: number;
  interviewerName: string;
  topic: string;
  difficulty: string;
  stage: string;
  turnType: string;
  clarity: number;
  technicalDepth: number;
  structure: number;
  overall: number;
  strengths: string[];
  weaknesses: string[];
  answerSummary: string;
  question: string;
};

export type AdminSession = {
  id: string;
  userId: string;
  userEmail: string;
  role: string | null;
  company: string | null;
  interviewType: string | null;
  overall_score: number | null;
  hire_decision: string | null;
  created_at: string;
  ended_at: string | null;
  totalRounds: number;
  rounds: AdminRoundSummary[];
  strengths: string[];
  weaknesses: string[];
  studyPlan: string;
  drillQuestions: string[];
  interviewers: { name: string; title: string; focus: string }[];
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  provider: string;
  avatarUrl: string | null;
  createdAt: string;
  lastSignIn: string | null;
  interviewCount: number;
  avgScore: number | null;
  bestScore: number | null;
  lastInterview: string | null;
  interviewTypes: string[];
};

export type ScoreDistributionBucket = { bucket: string; count: number };

export type AdminStats = {
  // counts
  totalUsers: number;
  totalInterviews: number;
  todayInterviews: number;
  weekInterviews: number;
  // aggregates
  avgScore: number | null;
  hireBreakdown: HireBreakdown;
  topRoles: TopEntry[];
  topCompanies: TopEntry[];
  // new aggregate stats
  interviewTypeBreakdown: Record<string, number>;
  scoreDistribution: ScoreDistributionBucket[];
  avgRoundsPerSession: number;
  completionRate: number;
  // detailed data
  sessions: AdminSession[];
  users: AdminUser[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEmailLookup(allUsers: { id: string; email?: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const u of allUsers) {
    if (u.email) map[u.id] = u.email;
  }
  return map;
}

function extractRounds(payload: InterviewSessionPayload | null): AdminRoundSummary[] {
  if (!payload?.rounds) return [];
  return payload.rounds.map((r, idx) => ({
    index: idx,
    interviewerName: r.interviewerName ?? "",
    topic: r.topic ?? "",
    difficulty: r.difficulty ?? "",
    stage: r.stage ?? "",
    turnType: r.turnType ?? "",
    clarity: r.evaluation?.clarity ?? 0,
    technicalDepth: r.evaluation?.technical_depth ?? 0,
    structure: r.evaluation?.structure ?? 0,
    overall: r.evaluation?.overall ?? 0,
    strengths: r.evaluation?.strengths ?? [],
    weaknesses: r.evaluation?.weaknesses ?? [],
    answerSummary: r.evaluation?.answer_summary ?? "",
    question: r.question ?? "",
  }));
}

function extractInterviewers(
  payload: InterviewSessionPayload | null,
): { name: string; title: string; focus: string }[] {
  if (!payload?.interviewers) return [];
  return payload.interviewers.map((p) => ({
    name: p.name ?? "",
    title: p.title ?? "",
    focus: p.focus ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

async function verifyAdminAccess(
  accessToken: string,
): Promise<
  | { ok: true; admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>> }
  | { ok: false; reason: string }
> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "admin_client_unavailable" };

  const userId = await getUserIdForToken(accessToken);
  if (!userId) return { ok: false, reason: "unauthorized" };

  const { data: userRecord, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userRecord?.user) return { ok: false, reason: "unauthorized" };
  if (userRecord.user.email !== ADMIN_EMAIL) return { ok: false, reason: "unauthorized" };

  return { ok: true, admin };
}

export const fetchAdminStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const authResult = await verifyAdminAccess(data.accessToken);
    if (!authResult.ok) {
      return { ok: false as const, reason: authResult.reason as string };
    }
    const admin = authResult.admin;

    // All users (up to 1000)
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    const allUsers = usersError ? [] : (usersData?.users ?? []);
    const totalUsers = allUsers.length;
    const emailLookup = buildEmailLookup(allUsers);

    // Fetch ALL sessions with full payload
    const { data: allSessions, error: sessionsError } = await admin
      .from("interview_sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (sessionsError || !allSessions) {
      return { ok: false as const, reason: "db_error" as string };
    }

    const totalInterviews = allSessions.length;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const todayInterviews = allSessions.filter((s) => s.created_at >= todayStart).length;
    const weekInterviews = allSessions.filter((s) => s.created_at >= weekAgo).length;

    // Average score
    const scoredSessions = allSessions.filter(
      (s) => typeof s.overall_score === "number" && s.overall_score !== null,
    );
    const avgScore =
      scoredSessions.length > 0
        ? scoredSessions.reduce((sum, s) => sum + (s.overall_score as number), 0) /
          scoredSessions.length
        : null;

    // Hire decision breakdown
    const hireBreakdown: HireBreakdown = {};
    for (const s of allSessions) {
      if (s.hire_decision) {
        hireBreakdown[s.hire_decision] = (hireBreakdown[s.hire_decision] ?? 0) + 1;
      }
    }

    // Top roles
    const roleCount: Record<string, number> = {};
    for (const s of allSessions) {
      if (s.role) roleCount[s.role] = (roleCount[s.role] ?? 0) + 1;
    }
    const topRoles: TopEntry[] = Object.entries(roleCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Top companies
    const companyCount: Record<string, number> = {};
    for (const s of allSessions) {
      if (s.company) companyCount[s.company] = (companyCount[s.company] ?? 0) + 1;
    }
    const topCompanies: TopEntry[] = Object.entries(companyCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Interview type breakdown
    const interviewTypeBreakdown: Record<string, number> = {};
    for (const s of allSessions) {
      const t = s.interview_type ?? "unknown";
      interviewTypeBreakdown[t] = (interviewTypeBreakdown[t] ?? 0) + 1;
    }

    // Score distribution buckets: 0-4, 4-6, 6-8, 8-10
    const buckets = [
      { bucket: "0-4", min: 0, max: 4 },
      { bucket: "4-6", min: 4, max: 6 },
      { bucket: "6-8", min: 6, max: 8 },
      { bucket: "8-10", min: 8, max: 10 },
    ];
    const scoreDistribution: ScoreDistributionBucket[] = buckets.map(({ bucket, min, max }) => ({
      bucket,
      count: scoredSessions.filter((s) => {
        const sc = s.overall_score as number;
        return sc >= min && (max === 10 ? sc <= max : sc < max);
      }).length,
    }));

    // Avg rounds per session
    let totalRoundsSum = 0;
    for (const s of allSessions) {
      const payload = s.payload as InterviewSessionPayload | null;
      totalRoundsSum += payload?.rounds?.length ?? 0;
    }
    const avgRoundsPerSession =
      totalInterviews > 0 ? totalRoundsSum / totalInterviews : 0;

    // Completion rate: sessions with a score / total
    const completionRate =
      totalInterviews > 0 ? scoredSessions.length / totalInterviews : 0;

    // Build per-user stats map
    type UserStatsEntry = {
      count: number;
      last: string | null;
      scores: number[];
      types: Set<string>;
    };
    const userStatsMap: Record<string, UserStatsEntry> = {};
    for (const s of allSessions) {
      const uid = s.user_id as string | undefined;
      if (!uid) continue;
      if (!userStatsMap[uid]) {
        userStatsMap[uid] = { count: 0, last: null, scores: [], types: new Set() };
      }
      const entry = userStatsMap[uid];
      entry.count += 1;
      if (!entry.last || s.created_at > entry.last) entry.last = s.created_at;
      if (typeof s.overall_score === "number" && s.overall_score !== null) {
        entry.scores.push(s.overall_score as number);
      }
      if (s.interview_type) entry.types.add(s.interview_type as string);
    }

    // Build AdminSession list (ALL sessions)
    const sessions: AdminSession[] = allSessions.map((s) => {
      const payload = s.payload as InterviewSessionPayload | null;
      const rounds = extractRounds(payload);
      const interviewers = extractInterviewers(payload);
      return {
        id: s.id as string,
        userId: (s.user_id as string) ?? "",
        userEmail: emailLookup[(s.user_id as string) ?? ""] ?? "—",
        role: s.role as string | null,
        company: s.company as string | null,
        interviewType: s.interview_type as string | null,
        overall_score: s.overall_score as number | null,
        hire_decision: s.hire_decision as string | null,
        created_at: s.created_at as string,
        ended_at: (s.ended_at as string | null) ?? null,
        totalRounds: rounds.length,
        rounds,
        strengths: payload?.strengths ?? [],
        weaknesses: payload?.weaknesses ?? [],
        studyPlan: payload?.study_plan ?? "",
        drillQuestions: payload?.drill_questions ?? [],
        interviewers,
      };
    });

    // Build AdminUser list
    const users: AdminUser[] = allUsers
      .map((u) => {
        const stats = userStatsMap[u.id];
        const scores = stats?.scores ?? [];
        const avgUserScore =
          scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : null;
        const bestScore = scores.length > 0 ? Math.max(...scores) : null;
        return {
          id: u.id,
          email: u.email ?? "—",
          name:
            (u.user_metadata?.full_name as string | undefined) ??
            (u.user_metadata?.name as string | undefined) ??
            (u.email?.split("@")[0] ?? "—"),
          provider: (u.app_metadata?.provider as string | undefined) ?? "unknown",
          avatarUrl: (u.user_metadata?.avatar_url as string | undefined) ?? null,
          createdAt: u.created_at,
          lastSignIn: u.last_sign_in_at ?? null,
          interviewCount: stats?.count ?? 0,
          avgScore: avgUserScore,
          bestScore,
          lastInterview: stats?.last ?? null,
          interviewTypes: stats ? Array.from(stats.types) : [],
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const stats: AdminStats = {
      totalUsers,
      totalInterviews,
      todayInterviews,
      weekInterviews,
      avgScore,
      hireBreakdown,
      topRoles,
      topCompanies,
      interviewTypeBreakdown,
      scoreDistribution,
      avgRoundsPerSession,
      completionRate,
      sessions,
      users,
    };

    return { ok: true as const, stats };
  });

export const fetchAdminSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SessionDetailSchema.parse(d))
  .handler(async ({ data }) => {
    const authResult = await verifyAdminAccess(data.accessToken);
    if (!authResult.ok) {
      return { ok: false as const, reason: authResult.reason as string };
    }
    const admin = authResult.admin;

    const { data: row, error } = await admin
      .from("interview_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .maybeSingle();

    if (error || !row) {
      return { ok: false as const, reason: "not_found" as string };
    }

    const payload = row.payload as InterviewSessionPayload | null;
    const rounds = extractRounds(payload);
    const interviewers = extractInterviewers(payload);

    const session: AdminSession = {
      id: row.id as string,
      userId: (row.user_id as string) ?? "",
      userEmail: "—",
      role: row.role as string | null,
      company: row.company as string | null,
      interviewType: row.interview_type as string | null,
      overall_score: row.overall_score as number | null,
      hire_decision: row.hire_decision as string | null,
      created_at: row.created_at as string,
      ended_at: (row.ended_at as string | null) ?? null,
      totalRounds: rounds.length,
      rounds,
      strengths: payload?.strengths ?? [],
      weaknesses: payload?.weaknesses ?? [],
      studyPlan: payload?.study_plan ?? "",
      drillQuestions: payload?.drill_questions ?? [],
      interviewers,
    };

    return { ok: true as const, session };
  });
