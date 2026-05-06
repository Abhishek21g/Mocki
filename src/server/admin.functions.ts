import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdminClient, getUserIdForToken } from "./supabase.server";

const ADMIN_EMAIL = "enaguthiabhishek@gmail.com";

const TokenSchema = z.object({ accessToken: z.string().min(10).max(8000) });

export type HireBreakdown = Record<string, number>;
export type TopEntry = { name: string; count: number };
export type RecentSession = {
  id: string;
  role: string | null;
  company: string | null;
  overall_score: number | null;
  hire_decision: string | null;
  created_at: string;
  interview_type: string | null;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  provider: string;
  createdAt: string;
  interviewCount: number;
  lastInterview: string | null;
};

export type AdminStats = {
  totalUsers: number;
  totalInterviews: number;
  todayInterviews: number;
  weekInterviews: number;
  avgScore: number | null;
  hireBreakdown: HireBreakdown;
  topRoles: TopEntry[];
  topCompanies: TopEntry[];
  recentSessions: RecentSession[];
  users: AdminUser[];
};

export const fetchAdminStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return { ok: false as const, reason: "admin_client_unavailable" as const };
    }

    // Verify caller is the admin user
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) {
      return { ok: false as const, reason: "unauthorized" as const };
    }

    const { data: userRecord, error: userError } =
      await admin.auth.admin.getUserById(userId);
    if (userError || !userRecord?.user) {
      return { ok: false as const, reason: "unauthorized" as const };
    }
    if (userRecord.user.email !== ADMIN_EMAIL) {
      return { ok: false as const, reason: "unauthorized" as const };
    }

    // All users (up to 1000)
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    const allUsers = usersError ? [] : (usersData?.users ?? []);
    const totalUsers = allUsers.length;

    // Fetch all interview sessions (we count in JS)
    const { data: allSessions, error: sessionsError } = await admin
      .from("interview_sessions")
      .select("id, role, company, overall_score, hire_decision, created_at, interview_type");

    if (sessionsError || !allSessions) {
      return { ok: false as const, reason: "db_error" as const };
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
      if (s.role) {
        roleCount[s.role] = (roleCount[s.role] ?? 0) + 1;
      }
    }
    const topRoles: TopEntry[] = Object.entries(roleCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Top companies
    const companyCount: Record<string, number> = {};
    for (const s of allSessions) {
      if (s.company) {
        companyCount[s.company] = (companyCount[s.company] ?? 0) + 1;
      }
    }
    const topCompanies: TopEntry[] = Object.entries(companyCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Recent sessions (last 10, sorted by created_at desc)
    const recentSessions: RecentSession[] = [...allSessions]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 10)
      .map((s) => ({
        id: s.id,
        role: s.role,
        company: s.company,
        overall_score: s.overall_score,
        hire_decision: s.hire_decision,
        created_at: s.created_at,
        interview_type: s.interview_type,
      }));

    // Build per-user interview counts
    const interviewsByUser: Record<string, { count: number; last: string | null }> = {};
    for (const s of allSessions) {
      const uid = (s as Record<string, unknown>).user_id as string | undefined;
      if (!uid) continue;
      const entry = interviewsByUser[uid] ?? { count: 0, last: null };
      entry.count += 1;
      if (!entry.last || s.created_at > entry.last) entry.last = s.created_at;
      interviewsByUser[uid] = entry;
    }

    const users: AdminUser[] = allUsers.map((u) => ({
      id: u.id,
      email: u.email ?? "—",
      name: (u.user_metadata?.full_name as string | undefined) ??
            (u.user_metadata?.name as string | undefined) ??
            (u.email?.split("@")[0] ?? "—"),
      provider: (u.app_metadata?.provider as string | undefined) ?? "unknown",
      createdAt: u.created_at,
      interviewCount: interviewsByUser[u.id]?.count ?? 0,
      lastInterview: interviewsByUser[u.id]?.last ?? null,
    })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const stats: AdminStats = {
      totalUsers,
      totalInterviews,
      todayInterviews,
      weekInterviews,
      avgScore,
      hireBreakdown,
      topRoles,
      topCompanies,
      recentSessions,
      users,
    };

    return { ok: true as const, stats };
  });
