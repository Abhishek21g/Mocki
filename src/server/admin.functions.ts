import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdminClient, getUserIdForToken } from "./supabase.server";
import { downloadJson } from "./spaces.server";
import { sendCheckInEmail, sendInviteEmail } from "./email.server";
import type { InterviewSessionPayload } from "./history.server";

const ADMIN_EMAILS = ["enaguthiabhishek@gmail.com", "muralikinti@gmail.com"];

const RECOVERED_INVITE_EMAILS = [
  "abhishek.enaguthi@pcc.edu",
  "adityashyam28@gmail.com",
  "ajinkyagokule@gmail.com",
  "brycetruong@gmail.com",
  "d.varma8774@gmail.com",
  "dhaya.nadhana@gmail.com",
  "dhushmk@gmail.com",
  "eabhishek2004@gmail.com",
  "eabhishek2005@gmail.com",
  "enagutha@oregonstate.edu",
  "enaguthia@gmail.com",
  "enaguthiabhishek2004@gmail.com",
  "enaguthiabhishek@gmail.com",
  "evasu.sapsd@gmail.com",
  "hendeross@gmail.com",
  "intim@oregonstate.edu",
  "josiahliebert@gmail.com",
  "kaveeom@gmail.com",
  "kavitha.enaguthi@gmail.com",
  "lucasjm0323@gmail.com",
  "meetashwin2000@gmail.com",
  "meetnraval@gmail.com",
  "muralikinti@gmail.com",
  "patenira@oregonstate.edu",
  "rajansaranya176@gmail.com",
  "sarveshthiruppathi@gmail.com",
  "shah.harshil187@gmail.com",
  "snehasannidhi97@gmail.com",
  "srijapalla1960@gmail.com",
  "tejassrirama1@gmail.com",
];

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
  answer: string;
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
  resume: string;
  jobDescription: string;
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

export type AdminOutreachLog = {
  id: string;
  userId: string | null;
  email: string;
  kind: "check_in" | "invite";
  status: "sent" | "failed";
  error: string | null;
  sentBy: string | null;
  providerMessageId: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  failedAt: string | null;
  lastEventAt: string | null;
  lastEventType: string | null;
  lastClickUrl: string | null;
  createdAt: string;
};

export type AdminInviteAnalytics = {
  invited: number;
  recoveredFromLogs: number;
  recoveredMissing: number;
  recoveredEmails: string[];
  signedUp: number;
  completedFirstInterview: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  conversionRate: number;
  firstInterviewRate: number;
  openRate: number;
  clickRate: number;
  sentToday: number;
  readyForNextBatch: boolean;
  nextBatchReason: string;
};

export type EnrichedInviteRow = {
  email: string;
  logId: string;
  sentAt: string;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  signedUp: boolean;
  sessionStarted: boolean;
  sessionCompleted: boolean;
  feedbackGiven: boolean;
  userId: string | null;
  lastActivityAt: string | null;
};

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
  outreachLogs: AdminOutreachLog[];
  inviteAnalytics: AdminInviteAnalytics;
  enrichedInviteRows: EnrichedInviteRow[];
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

function inviteRowStage(row: EnrichedInviteRow): number {
  if (row.feedbackGiven) return 6;
  if (row.sessionCompleted) return 5;
  if (row.sessionStarted) return 4;
  if (row.signedUp) return 3;
  if (row.clicked) return 2;
  if (row.opened) return 1;
  return 0;
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
    answer: r.answer ?? "",
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
  | {
      ok: true;
      admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
      adminEmail: string;
    }
  | { ok: false; reason: string }
> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "admin_client_unavailable" };

  const userId = await getUserIdForToken(accessToken);
  if (!userId) return { ok: false, reason: "unauthorized" };

  const { data: userRecord, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userRecord?.user) return { ok: false, reason: "unauthorized" };
  const adminEmail = userRecord.user.email ?? "";
  if (!ADMIN_EMAILS.includes(adminEmail)) return { ok: false, reason: "unauthorized" };

  return { ok: true, admin, adminEmail };
}

async function logOutreach(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  entry: {
    userId?: string | null;
    email: string;
    kind: "check_in" | "invite";
    status: "sent" | "failed";
    error?: string | null;
    sentBy: string;
    providerMessageId?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from("email_outreach_log").insert({
    user_id: entry.userId ?? null,
    email: entry.email,
    kind: entry.kind,
    status: entry.status,
    error: entry.error ?? null,
    sent_by: entry.sentBy,
    provider_message_id: entry.providerMessageId ?? null,
  });
  if (!error) return { ok: true };

  // Older production DBs may not have the Resend analytics migration yet.
  // Still record the outreach so admins do not lose sent-invite history.
  if (error.message?.includes("provider_message_id")) {
    const fallback = await admin.from("email_outreach_log").insert({
      user_id: entry.userId ?? null,
      email: entry.email,
      kind: entry.kind,
      status: entry.status,
      error: entry.error ?? null,
      sent_by: entry.sentBy,
    });
    if (!fallback.error) return { ok: true };
    console.error("[admin] failed to log outreach fallback:", fallback.error);
    return { ok: false, error: fallback.error.message };
  }

  console.error("[admin] failed to log outreach:", error);
  return { ok: false, error: error.message };
}

async function findSentOutreach(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  data: { kind: "check_in" | "invite"; email: string; userId?: string | null },
): Promise<AdminOutreachLog | null> {
  let query = admin
    .from("email_outreach_log")
    .select("*")
    .eq("kind", data.kind)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1);

  query = data.userId ? query.eq("user_id", data.userId) : query.eq("email", data.email);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[admin] failed to check outreach log:", error);
    return null;
  }
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id as string,
    userId: (row.user_id as string | null) ?? null,
    email: (row.email as string | null) ?? data.email,
    kind: row.kind as "check_in" | "invite",
    status: row.status as "sent" | "failed",
    error: (row.error as string | null) ?? null,
    sentBy: (row.sent_by as string | null) ?? null,
    providerMessageId: (row.provider_message_id as string | null) ?? null,
    deliveredAt: (row.delivered_at as string | null) ?? null,
    openedAt: (row.opened_at as string | null) ?? null,
    clickedAt: (row.clicked_at as string | null) ?? null,
    bouncedAt: (row.bounced_at as string | null) ?? null,
    complainedAt: (row.complained_at as string | null) ?? null,
    failedAt: (row.failed_at as string | null) ?? null,
    lastEventAt: (row.last_event_at as string | null) ?? null,
    lastEventType: (row.last_event_type as string | null) ?? null,
    lastClickUrl: (row.last_click_url as string | null) ?? null,
    createdAt: row.created_at as string,
  };
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

    const { data: outreachData, error: outreachError } = await admin
      .from("email_outreach_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (outreachError) {
      console.error("[admin] failed to load outreach log:", outreachError);
    }
    const outreachLogs: AdminOutreachLog[] = (outreachData ?? []).map((row) => ({
      id: row.id as string,
      userId: (row.user_id as string | null) ?? null,
      email: (row.email as string | null) ?? "—",
      kind: row.kind as "check_in" | "invite",
      status: row.status as "sent" | "failed",
      error: (row.error as string | null) ?? null,
      sentBy: (row.sent_by as string | null) ?? null,
      providerMessageId: (row.provider_message_id as string | null) ?? null,
      deliveredAt: (row.delivered_at as string | null) ?? null,
      openedAt: (row.opened_at as string | null) ?? null,
      clickedAt: (row.clicked_at as string | null) ?? null,
      bouncedAt: (row.bounced_at as string | null) ?? null,
      complainedAt: (row.complained_at as string | null) ?? null,
      failedAt: (row.failed_at as string | null) ?? null,
      lastEventAt: (row.last_event_at as string | null) ?? null,
      lastEventType: (row.last_event_type as string | null) ?? null,
      lastClickUrl: (row.last_click_url as string | null) ?? null,
      createdAt: row.created_at as string,
    }));

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
        resume: payload?.resume ?? "",
        jobDescription: payload?.jobDescription ?? "",
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

    const inviteLogs = outreachLogs.filter((log) => log.kind === "invite" && log.status === "sent");
    const invitedEmails = new Set(inviteLogs.map((log) => log.email.toLowerCase()));
    const recoveredEmails = Array.from(
      new Set(RECOVERED_INVITE_EMAILS.map((email) => email.toLowerCase())),
    ).sort();
    const recoveredMissing = recoveredEmails.filter((email) => !invitedEmails.has(email)).length;
    const signedUpInviteUsers = users.filter((u) => invitedEmails.has(u.email.toLowerCase()));
    const signedUpInviteEmails = new Set(signedUpInviteUsers.map((u) => u.email.toLowerCase()));
    const completedInviteUsers = signedUpInviteUsers.filter((u) => u.interviewCount > 0);
    const todayOutreachStart = todayStart;
    const sentToday = inviteLogs.filter((log) => log.createdAt >= todayOutreachStart).length;
    const bounced = inviteLogs.filter((log) => log.bouncedAt).length;
    const complained = inviteLogs.filter((log) => log.complainedAt).length;
    const delivered = inviteLogs.filter((log) => log.deliveredAt).length;
    const opened = inviteLogs.filter((log) => log.openedAt).length;
    const clicked = inviteLogs.filter((log) => log.clickedAt).length;
    const deliverabilityRisk = bounced > 0 || complained > 0;
    const readyForNextBatch = sentToday < 8 && !deliverabilityRisk;
    const inviteAnalytics: AdminInviteAnalytics = {
      invited: invitedEmails.size,
      recoveredFromLogs: recoveredEmails.length,
      recoveredMissing,
      recoveredEmails,
      signedUp: signedUpInviteEmails.size,
      completedFirstInterview: completedInviteUsers.length,
      delivered,
      opened,
      clicked,
      bounced,
      complained,
      conversionRate: invitedEmails.size > 0 ? signedUpInviteEmails.size / invitedEmails.size : 0,
      firstInterviewRate:
        signedUpInviteEmails.size > 0 ? completedInviteUsers.length / signedUpInviteEmails.size : 0,
      openRate: delivered > 0 ? opened / delivered : 0,
      clickRate: delivered > 0 ? clicked / delivered : 0,
      sentToday,
      readyForNextBatch,
      nextBatchReason: deliverabilityRisk
        ? "Pause: bounce or complaint detected"
        : sentToday >= 8
          ? "Pause: today's invite batch is full"
          : "Ready for a small 5-8 person batch",
    };

    // --- Enriched invite rows for funnel UI ---
    const userByEmail: Record<string, AdminUser> = {};
    for (const u of users) {
      if (u.email !== "—") userByEmail[u.email.toLowerCase()] = u;
    }

    const sessionsByUserId: Record<string, any[]> = {};
    for (const s of allSessions) {
      const uid = s.user_id as string | null;
      if (!uid) continue;
      if (!sessionsByUserId[uid]) sessionsByUserId[uid] = [];
      sessionsByUserId[uid].push(s);
    }

    // Build latest invite log per email (from DB logs)
    const latestInviteByEmail = new Map<string, AdminOutreachLog>();
    for (const log of inviteLogs) {
      const key = log.email.toLowerCase();
      const prev = latestInviteByEmail.get(key);
      if (!prev || log.createdAt > prev.createdAt) latestInviteByEmail.set(key, log);
    }
    // Merge recovered emails as stub logs where not already in DB
    for (const email of RECOVERED_INVITE_EMAILS) {
      const key = email.toLowerCase();
      if (!latestInviteByEmail.has(key)) {
        latestInviteByEmail.set(key, {
          id: `recovered-${email}`,
          userId: null,
          email,
          kind: "invite",
          status: "sent",
          error: null,
          sentBy: "recovered",
          providerMessageId: null,
          deliveredAt: null,
          openedAt: null,
          clickedAt: null,
          bouncedAt: null,
          complainedAt: null,
          failedAt: null,
          lastEventAt: null,
          lastEventType: null,
          lastClickUrl: null,
          createdAt: "2026-05-07T00:00:00.000Z",
        });
      }
    }

    const enrichedInviteRows: EnrichedInviteRow[] = Array.from(latestInviteByEmail.values()).map((log) => {
      const emailKey = log.email.toLowerCase();
      const user = userByEmail[emailKey];
      const userId = user?.id ?? log.userId ?? null;
      const userSessions = userId ? (sessionsByUserId[userId] ?? []) : [];
      const completedSessions = userSessions.filter((s) => s.overall_score !== null);

      const candidates = [
        log.createdAt,
        log.deliveredAt,
        log.openedAt,
        log.clickedAt,
        log.lastEventAt,
        user?.lastSignIn ?? null,
        user?.lastInterview ?? null,
      ].filter((d): d is string => Boolean(d));

      return {
        email: log.email,
        logId: log.id,
        sentAt: log.createdAt,
        delivered: Boolean(log.deliveredAt),
        opened: Boolean(log.openedAt),
        clicked: Boolean(log.clickedAt),
        signedUp: Boolean(user),
        sessionStarted: userSessions.length > 0,
        sessionCompleted: completedSessions.length > 0,
        feedbackGiven: false,
        userId,
        lastActivityAt: candidates.length > 0 ? candidates.reduce((a, b) => (a > b ? a : b)) : null,
      };
    });
    enrichedInviteRows.sort((a, b) => {
      const diff = inviteRowStage(b) - inviteRowStage(a);
      if (diff !== 0) return diff;
      const la = a.lastActivityAt ?? "";
      const lb = b.lastActivityAt ?? "";
      return la < lb ? 1 : la > lb ? -1 : 0;
    });

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
      outreachLogs,
      inviteAnalytics,
      enrichedInviteRows,
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
      resume: payload?.resume ?? "",
      jobDescription: payload?.jobDescription ?? "",
    };

    return { ok: true as const, session };
  });

const AdminRecordingSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  userId: z.string().min(1),
  sessionId: z.string().min(1),
});

export const fetchAdminRecordingUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AdminRecordingSchema.parse(d))
  .handler(async ({ data }) => {
    const authResult = await verifyAdminAccess(data.accessToken);
    if (!authResult.ok) return { ok: false as const, webmUrl: null, mp4Url: null };

    const params = new URLSearchParams({
      accessToken: data.accessToken,
      userId: data.userId,
      sessionId: data.sessionId,
    });
    const webmUrl = `/api/admin-recording?${params.toString()}&ext=webm`;
    const mp4Url = `/api/admin-recording?${params.toString()}&ext=mp4`;

    return { ok: true as const, webmUrl, mp4Url };
  });

export const fetchAdminBehavioral = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AdminRecordingSchema.parse(d))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    const authResult = await verifyAdminAccess(data.accessToken);
    if (!authResult.ok) return { ok: false, data: null };
    const key = `sessions/${data.userId}/${data.sessionId}/behavioral.json`;
    const json = await downloadJson(key);
    return { ok: true, data: json };
  });

const CheckInSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  userIds: z.array(z.string().min(1)).min(1).max(500),
});

export type CheckInResult = {
  userId: string;
  email: string;
  status: "sent" | "failed" | "skipped";
  ok: boolean;
  error?: string;
  sentAt?: string;
};

export const sendAdminCheckInEmails = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CheckInSchema.parse(d))
  .handler(async ({ data }) => {
    const authResult = await verifyAdminAccess(data.accessToken);
    if (!authResult.ok) return { ok: false as const, reason: authResult.reason, results: [] };
    const admin = authResult.admin;

    const { data: usersData, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return { ok: false as const, reason: "db_error", results: [] };

    const targetUsers = (usersData?.users ?? []).filter((u) => data.userIds.includes(u.id));

    const results: CheckInResult[] = [];
    for (let i = 0; i < targetUsers.length; i++) {
      const user = targetUsers[i];
      const email = user.email;
      if (!email) {
        results.push({
          userId: user.id,
          email: "—",
          status: "failed",
          ok: false,
          error: "no email",
        });
        continue;
      }
      const name =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        email.split("@")[0];
      const existing = await findSentOutreach(admin, {
        kind: "check_in",
        email,
        userId: user.id,
      });
      if (existing) {
        results.push({
          userId: user.id,
          email,
          status: "skipped",
          ok: true,
          sentAt: existing.createdAt,
        });
        continue;
      }
      // Throttle: 300ms between sends to stay under Resend's rate limit
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 300));
      const result = await sendCheckInEmail(email, name);
      await logOutreach(admin, {
        userId: user.id,
        email,
        kind: "check_in",
        status: result.ok ? "sent" : "failed",
        error: result.error,
        sentBy: authResult.adminEmail,
        providerMessageId: result.messageId,
      });
      results.push({
        userId: user.id,
        email,
        status: result.ok ? "sent" : "failed",
        ok: result.ok,
        error: result.error,
      });
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    return { ok: true as const, sent, failed, skipped, results };
  });

const InviteSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  emails: z.array(z.string().email()).min(1).max(200),
});

const DeleteOutreachSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  outreachLogId: z.string().min(1).max(200),
});

export type InviteResult = {
  email: string;
  status: "sent" | "failed" | "skipped";
  ok: boolean;
  error?: string;
  sentAt?: string;
  logError?: string;
};

export const sendAdminInviteEmails = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InviteSchema.parse(d))
  .handler(async ({ data }) => {
    const authResult = await verifyAdminAccess(data.accessToken);
    if (!authResult.ok) return { ok: false as const, reason: authResult.reason, results: [] };
    const admin = authResult.admin;

    const results: InviteResult[] = [];
    for (let i = 0; i < data.emails.length; i++) {
      const existing = await findSentOutreach(admin, {
        kind: "invite",
        email: data.emails[i],
      });
      if (existing) {
        results.push({
          email: data.emails[i],
          status: "skipped",
          ok: true,
          sentAt: existing.createdAt,
        });
        continue;
      }
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 300));
      const result = await sendInviteEmail(data.emails[i]);
      const logged = await logOutreach(admin, {
        email: data.emails[i],
        kind: "invite",
        status: result.ok ? "sent" : "failed",
        error: result.error,
        sentBy: authResult.adminEmail,
        providerMessageId: result.messageId,
      });
      results.push({
        email: data.emails[i],
        status: result.ok ? "sent" : "failed",
        ok: result.ok,
        error: result.error,
        sentAt: result.ok ? new Date().toISOString() : undefined,
        logError: logged.ok ? undefined : logged.error,
      });
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    return { ok: true as const, sent, failed, skipped, results };
  });

export const markAdminInviteEmailsSent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InviteSchema.parse(d))
  .handler(async ({ data }) => {
    const authResult = await verifyAdminAccess(data.accessToken);
    if (!authResult.ok) return { ok: false as const, reason: authResult.reason, results: [] };
    const admin = authResult.admin;

    const results: InviteResult[] = [];
    for (const email of data.emails) {
      const existing = await findSentOutreach(admin, { kind: "invite", email });
      if (existing) {
        results.push({ email, status: "skipped", ok: true, sentAt: existing.createdAt });
        continue;
      }
      const sentAt = new Date().toISOString();
      const logged = await logOutreach(admin, {
        email,
        kind: "invite",
        status: "sent",
        sentBy: authResult.adminEmail,
      });
      results.push({
        email,
        status: logged.ok ? "sent" : "failed",
        ok: logged.ok,
        error: logged.error,
        sentAt: logged.ok ? sentAt : undefined,
      });
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    return { ok: true as const, sent, failed, skipped, results };
  });

export const deleteAdminOutreachLog = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DeleteOutreachSchema.parse(d))
  .handler(async ({ data }) => {
    const authResult = await verifyAdminAccess(data.accessToken);
    if (!authResult.ok) return { ok: false as const, reason: authResult.reason };

    const { error } = await authResult.admin
      .from("email_outreach_log")
      .delete()
      .eq("id", data.outreachLogId)
      .eq("kind", "invite");

    if (error) {
      console.error("[admin] failed to delete outreach log:", error);
      return { ok: false as const, reason: error.message };
    }

    return { ok: true as const };
  });
