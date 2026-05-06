import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { getHireBg, getHireColor, scoreToColor } from "@/lib/ghost-utils";
import { fetchAdminStats, type AdminStats, type AdminUser } from "@/server/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin · Mocki" }],
  }),
  component: AdminPage,
});

const ADMIN_EMAIL = "enaguthiabhishek@gmail.com";

function AdminPage() {
  const { status, user, getAccessToken } = useSupabaseAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status !== "ready") return;
    if (!user || user.email !== ADMIN_EMAIL) return;

    const accessToken = getAccessToken();
    if (!accessToken) return;

    setLoading(true);
    fetchAdminStats({ data: { accessToken } })
      .then((res) => {
        if (res.ok) {
          setStats(res.stats);
        } else {
          setError(`Failed to load stats: ${res.reason}`);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [status, user, getAccessToken]);

  if (status === "loading") {
    return (
      <div className="grid-bg flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
          <span className="gp-spinner" /> Loading…
        </div>
      </div>
    );
  }

  if (status === "ready" && (!user || user.email !== ADMIN_EMAIL)) {
    return <Navigate to="/" />;
  }

  return (
    <div className="grid-bg min-h-screen pb-24">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 pt-6">
        <div className="flex items-center gap-4">
          <HomeLogo className="text-base" />
          <span
            className="mono rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider"
            style={{
              color: "var(--green)",
              borderColor: "rgba(118,185,0,0.35)",
              background: "rgba(118,185,0,0.07)",
            }}
          >
            Admin Dashboard
          </span>
        </div>
        <span className="mono text-xs" style={{ color: "var(--text-3)" }}>
          {user?.email}
        </span>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-10">
        {error && (
          <div
            className="mb-6 rounded-md border px-4 py-3 text-sm"
            style={{
              borderColor: "rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.1)",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        {loading && !stats && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <span className="gp-spinner" /> Loading stats…
          </div>
        )}

        {stats && (
          <>
            {/* Stat cards */}
            <section className="fade-up">
              <div
                className="mono mb-4 text-[11px] uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Overview
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Total Users" value={stats.totalUsers} />
                <StatCard label="Total Interviews" value={stats.totalInterviews} />
                <StatCard label="This Week" value={stats.weekInterviews} />
                <StatCard label="Today" value={stats.todayInterviews} />
              </div>
            </section>

            {/* Avg Score */}
            <section className="fade-up mt-8">
              <div
                className="mono mb-4 text-[11px] uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Average Score
              </div>
              <div className="gp-card p-6 inline-block">
                {stats.avgScore !== null ? (
                  <span
                    className="text-5xl font-bold tabular-nums"
                    style={{ color: scoreToColor(stats.avgScore) }}
                  >
                    {stats.avgScore.toFixed(1)}
                    <span className="ml-1 text-xl font-normal" style={{ color: "var(--text-3)" }}>
                      / 10
                    </span>
                  </span>
                ) : (
                  <span className="text-2xl" style={{ color: "var(--text-3)" }}>
                    No data
                  </span>
                )}
              </div>
            </section>

            {/* Hire decision breakdown */}
            <section className="fade-up mt-8">
              <div
                className="mono mb-4 text-[11px] uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Hire Decision Breakdown
              </div>
              <div className="gp-card p-6">
                <HireBreakdownChart breakdown={stats.hireBreakdown} />
              </div>
            </section>

            {/* Top Roles & Top Companies */}
            <section className="fade-up mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <div
                  className="mono mb-4 text-[11px] uppercase tracking-wider"
                  style={{ color: "var(--text-3)" }}
                >
                  Top Roles
                </div>
                <div className="gp-card p-6">
                  <TopList entries={stats.topRoles} />
                </div>
              </div>
              <div>
                <div
                  className="mono mb-4 text-[11px] uppercase tracking-wider"
                  style={{ color: "var(--text-3)" }}
                >
                  Top Companies
                </div>
                <div className="gp-card p-6">
                  <TopList entries={stats.topCompanies} />
                </div>
              </div>
            </section>

            {/* Recent Sessions */}
            <section className="fade-up mt-8">
              <div
                className="mono mb-4 text-[11px] uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Recent Sessions
              </div>
              <div className="gp-card p-6">
                <RecentSessionsList sessions={stats.recentSessions} />
              </div>
            </section>

            {/* Users */}
            <section className="fade-up mt-8">
              <div
                className="mono mb-4 text-[11px] uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                All Users ({stats.users.length})
              </div>
              <div className="gp-card p-6">
                <UsersList users={stats.users} />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="gp-card p-6">
      <div
        className="mono text-[11px] uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function HireBreakdownChart({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-3)" }}>
        No hire decisions yet.
      </p>
    );
  }
  const max = Math.max(...entries.map(([, c]) => c));
  return (
    <div className="flex flex-col gap-3">
      {entries.map(([decision, count]) => (
        <div key={decision} className="flex items-center gap-3">
          <span
            className="mono w-24 shrink-0 text-right text-[11px] uppercase"
            style={{ color: getHireColor(decision) }}
          >
            {decision}
          </span>
          <div
            className="h-5 rounded"
            style={{
              width: `${Math.max(4, (count / max) * 100)}%`,
              background: getHireBg(decision),
              border: `1px solid ${getHireColor(decision)}40`,
              minWidth: "4px",
            }}
          />
          <span className="mono text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

function TopList({ entries }: { entries: { name: string; count: number }[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-3)" }}>
        No data yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map(({ name, count }) => (
        <li key={name} className="flex items-center justify-between gap-3">
          <span className="truncate text-sm">{name}</span>
          <span
            className="mono shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums"
            style={{
              background: "var(--surface2)",
              color: "var(--text-2)",
            }}
          >
            {count}
          </span>
        </li>
      ))}
    </ul>
  );
}

function UsersList({ users }: { users: AdminUser[] }) {
  if (users.length === 0) {
    return <p className="text-sm" style={{ color: "var(--text-3)" }}>No users yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
      {users.map((u) => {
        const joined = (() => {
          try { return new Date(u.createdAt).toLocaleDateString(); } catch { return "—"; }
        })();
        const lastInterview = (() => {
          if (!u.lastInterview) return null;
          try { return new Date(u.lastInterview).toLocaleDateString(); } catch { return null; }
        })();
        return (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: "var(--green-dim)", color: "var(--green)" }}
                >
                  {u.name[0]?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-3)" }}>{u.email}</div>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span
                className="mono rounded-full border px-2 py-0.5 text-[11px] capitalize"
                style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
              >
                {u.provider}
              </span>
              <span
                className="mono rounded-full px-2 py-0.5 text-[11px] tabular-nums"
                style={{ background: "var(--surface2)", color: u.interviewCount > 0 ? "var(--green)" : "var(--text-3)" }}
              >
                {u.interviewCount} interview{u.interviewCount !== 1 ? "s" : ""}
              </span>
              <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
                joined {joined}
                {lastInterview ? ` · last active ${lastInterview}` : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RecentSessionsList({
  sessions,
}: {
  sessions: {
    id: string;
    role: string | null;
    company: string | null;
    overall_score: number | null;
    hire_decision: string | null;
    created_at: string;
    interview_type: string | null;
  }[];
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-3)" }}>
        No sessions yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
      {sessions.map((s) => {
        const date = (() => {
          try {
            return new Date(s.created_at).toLocaleString();
          } catch {
            return s.created_at;
          }
        })();
        return (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {s.role || "Untitled"}{" "}
                <span style={{ color: "var(--text-3)" }}>@</span>{" "}
                {s.company || "—"}
              </div>
              <div
                className="mono mt-0.5 text-[11px] uppercase"
                style={{ color: "var(--text-3)" }}
              >
                {date}
                {s.interview_type ? ` · ${s.interview_type}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {typeof s.overall_score === "number" && (
                <span
                  className="mono rounded px-2 py-0.5 text-sm font-bold tabular-nums"
                  style={{
                    color: scoreToColor(s.overall_score),
                    background: `${scoreToColor(s.overall_score)}1a`,
                  }}
                >
                  {s.overall_score.toFixed(1)}
                </span>
              )}
              {s.hire_decision && (
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
                  style={{
                    background: getHireBg(s.hire_decision),
                    color: getHireColor(s.hire_decision),
                    border: `1px solid ${getHireColor(s.hire_decision)}`,
                  }}
                >
                  {s.hire_decision}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
