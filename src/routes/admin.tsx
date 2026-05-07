import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { getHireBg, getHireColor, scoreToColor } from "@/lib/ghost-utils";
import {
  fetchAdminStats,
  fetchAdminRecordingUrl,
  fetchAdminBehavioral,
  sendAdminCheckInEmails,
  sendAdminInviteEmails,
  type AdminSession,
  type AdminStats,
  type AdminUser,
  type AdminOutreachLog,
  type ScoreDistributionBucket,
  type CheckInResult,
  type InviteResult,
} from "@/server/admin.functions";
import type { BehavioralPayload } from "@/hooks/useBehavioralTracker";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin · Mocki" }],
  }),
  component: AdminPage,
});

const ADMIN_EMAILS = ["enaguthiabhishek@gmail.com", "muralikinti@gmail.com"];
type AdminTab = "overview" | "sessions" | "users" | "outreach";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AdminPage() {
  const { status, user, getAccessToken, signInWithGoogle } = useSupabaseAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  const load = useCallback(() => {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    fetchAdminStats({ data: { accessToken } })
      .then((res) => {
        if (res.ok) {
          setStats(res.stats);
          setLastRefresh(new Date());
        } else {
          setError(`Failed to load stats: ${res.reason}`);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [getAccessToken]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) return;
    load();
  }, [status, user, load]);

  if (status === "loading") {
    return (
      <div className="grid-bg flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
          <span className="gp-spinner" /> Loading…
        </div>
      </div>
    );
  }

  if (status === "ready" && !user) {
    return <AdminLoginPage signInWithGoogle={signInWithGoogle} />;
  }

  if (status === "ready" && user && !ADMIN_EMAILS.includes(user.email ?? "")) {
    return (
      <div className="grid-bg flex min-h-screen items-center justify-center px-5">
        <div className="fade-up text-center">
          <HomeLogo className="text-4xl font-extrabold tracking-tight" />
          <p className="mt-4 text-sm" style={{ color: "var(--text-3)" }}>
            {user.email} is not authorised to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-bg min-h-screen pb-24">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 pt-6">
        <div className="flex items-center gap-3">
          <HomeLogo className="text-base" />
          <span
            className="mono rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider"
            style={{
              color: "var(--green)",
              borderColor: "rgba(118,185,0,0.35)",
              background: "rgba(118,185,0,0.07)",
            }}
          >
            Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
              refreshed {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <span className="mono text-xs" style={{ color: "var(--text-3)" }}>
            {user?.email}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="mono rounded border px-3 py-1 text-[11px] uppercase tracking-wider transition-opacity disabled:opacity-50"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-2)",
              background: "var(--surface2)",
            }}
          >
            {loading ? "Loading…" : "↺ Refresh"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pt-10">
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
            <AdminTabs
              activeTab={activeTab}
              onChange={setActiveTab}
              stats={stats}
            />

            {activeTab === "overview" && (
              <>
            {/* ── Overview cards row 1 ───────────────────────────── */}
            <section className="fade-up">
              <SectionLabel>Overview</SectionLabel>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Total Users" value={stats.totalUsers} />
                <StatCard label="Total Interviews" value={stats.totalInterviews} />
                <StatCard label="This Week" value={stats.weekInterviews} />
                <StatCard label="Today" value={stats.todayInterviews} />
              </div>
            </section>

            {/* ── Overview cards row 2 ───────────────────────────── */}
            <section className="fade-up mt-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <ScoreCard label="Avg Score" score={stats.avgScore} />
                <StatCard
                  label="Completion Rate"
                  value={`${(stats.completionRate * 100).toFixed(0)}%`}
                />
                <StatCard
                  label="Avg Rounds / Session"
                  value={stats.avgRoundsPerSession.toFixed(1)}
                />
                <StatCard
                  label="Unique Companies"
                  value={Object.keys(
                    stats.sessions.reduce<Record<string, boolean>>((acc, s) => {
                      if (s.company) acc[s.company] = true;
                      return acc;
                    }, {}),
                  ).length}
                />
              </div>
            </section>

            {/* ── Interview Type Breakdown ───────────────────────── */}
            <section className="fade-up mt-8">
              <SectionLabel>Interview Type Breakdown</SectionLabel>
              <div className="gp-card p-6">
                <BarChart
                  entries={Object.entries(stats.interviewTypeBreakdown).sort(
                    (a, b) => b[1] - a[1],
                  )}
                  labelColor={(k) => {
                    if (k === "technical") return "#60a5fa";
                    if (k === "behavioral") return "#a78bfa";
                    return "var(--green)";
                  }}
                  bgColor={(k) => {
                    if (k === "technical") return "rgba(96,165,250,0.15)";
                    if (k === "behavioral") return "rgba(167,139,250,0.15)";
                    return "rgba(118,185,0,0.12)";
                  }}
                />
              </div>
            </section>

            {/* ── Score Distribution ────────────────────────────── */}
            <section className="fade-up mt-8">
              <SectionLabel>Score Distribution</SectionLabel>
              <div className="gp-card p-6">
                <ScoreDistributionChart buckets={stats.scoreDistribution} />
              </div>
            </section>

            {/* ── Hire Decision Breakdown ───────────────────────── */}
            <section className="fade-up mt-8">
              <SectionLabel>Hire Decision Breakdown</SectionLabel>
              <div className="gp-card p-6">
                <BarChart
                  entries={Object.entries(stats.hireBreakdown).sort((a, b) => b[1] - a[1])}
                  labelColor={(k) => getHireColor(k)}
                  bgColor={(k) => getHireBg(k)}
                  borderColor={(k) => `${getHireColor(k)}40`}
                />
              </div>
            </section>

            {/* ── Top Roles + Top Companies ─────────────────────── */}
            <section className="fade-up mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <SectionLabel>Top Roles</SectionLabel>
                <div className="gp-card p-6">
                  <TopList entries={stats.topRoles} />
                </div>
              </div>
              <div>
                <SectionLabel>Top Companies</SectionLabel>
                <div className="gp-card p-6">
                  <TopList entries={stats.topCompanies} />
                </div>
              </div>
            </section>
              </>
            )}

            {/* ── All Sessions ──────────────────────────────────── */}
            {activeTab === "sessions" && (
            <section className="fade-up mt-8">
              <SectionLabel>All Sessions ({stats.sessions.length})</SectionLabel>
              <div className="gp-card overflow-hidden p-0">
                <AllSessionsTable sessions={stats.sessions} accessToken={getAccessToken() ?? ""} />
              </div>
            </section>
            )}

            {/* ── All Users ─────────────────────────────────────── */}
            {activeTab === "users" && (
            <section className="fade-up mt-8">
              <SectionLabel>All Users ({stats.users.length})</SectionLabel>
              <div className="gp-card overflow-hidden p-0">
                <AllUsersTable users={stats.users} sessions={stats.sessions} />
              </div>
            </section>
            )}

            {/* ── Outreach ──────────────────────────────────────── */}
            {activeTab === "outreach" && (
              <>
            <section className="fade-up mt-8">
              <OutreachSection
                users={stats.users}
                logs={stats.outreachLogs}
                accessToken={getAccessToken() ?? ""}
              />
            </section>
            <section className="fade-up mt-8">
              <InviteSection
                accessToken={getAccessToken() ?? ""}
                logs={stats.outreachLogs}
              />
            </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AdminTabs({
  activeTab,
  onChange,
  stats,
}: {
  activeTab: AdminTab;
  onChange: (tab: AdminTab) => void;
  stats: AdminStats;
}) {
  const inactiveUsers = stats.users.filter((u) => u.interviewCount === 0).length;
  const sentCheckIns = new Set(
    stats.outreachLogs
      .filter((log) => log.kind === "check_in" && log.status === "sent" && log.userId)
      .map((log) => log.userId),
  ).size;
  const tabs: { id: AdminTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions", count: stats.sessions.length },
    { id: "users", label: "Users", count: stats.users.length },
    { id: "outreach", label: "Outreach", count: Math.max(inactiveUsers - sentCheckIns, 0) },
  ];

  return (
    <div className="fade-up sticky top-0 z-20 -mx-6 mb-8 border-b px-6 py-3 backdrop-blur"
      style={{ borderColor: "var(--border)", background: "rgba(8,8,8,0.82)" }}
    >
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="mono rounded-md border px-3 py-2 text-[11px] uppercase tracking-wider"
              style={{
                borderColor: active ? "rgba(118,185,0,0.55)" : "var(--border)",
                background: active ? "rgba(118,185,0,0.12)" : "var(--surface2)",
                color: active ? "var(--green)" : "var(--text-3)",
              }}
            >
              {tab.label}
              {typeof tab.count === "number" && (
                <span style={{ marginLeft: 8, color: active ? "var(--text)" : "var(--text-3)" }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin login page
// ---------------------------------------------------------------------------

function AdminLoginPage({ signInWithGoogle }: { signInWithGoogle: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    try {
      // Store intended destination — auth callback reads this after sign-in
      sessionStorage.setItem("auth:next", "/admin");
      await signInWithGoogle();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center px-5">
      <div className="fade-up w-full max-w-sm text-center">
        <HomeLogo className="text-4xl font-extrabold tracking-tight" />
        <p className="mt-2 mb-1 text-xs uppercase tracking-widest mono" style={{ color: "var(--green)" }}>
          Admin
        </p>
        <p className="mb-8 text-sm" style={{ color: "var(--text-3)" }}>
          Sign in with an authorised account to continue.
        </p>

        <div className="gp-card p-8" style={{ boxShadow: "0 0 40px rgba(118,185,0,0.08)" }}>
          <button
            className="gp-btn w-full"
            disabled={loading}
            onClick={handleGoogle}
          >
            {loading ? (
              <><span className="gp-spinner" /> Signing in…</>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitive UI helpers
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono mb-4 text-[11px] uppercase tracking-wider"
      style={{ color: "var(--text-3)" }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="gp-card p-6">
      <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="gp-card p-6">
      <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      {score !== null ? (
        <div
          className="mt-3 text-3xl font-bold tabular-nums"
          style={{ color: scoreToColor(score) }}
        >
          {score.toFixed(1)}
          <span className="ml-1 text-base font-normal" style={{ color: "var(--text-3)" }}>
            /10
          </span>
        </div>
      ) : (
        <div className="mt-3 text-xl" style={{ color: "var(--text-3)" }}>
          —
        </div>
      )}
    </div>
  );
}

function BarChart({
  entries,
  labelColor,
  bgColor,
  borderColor,
}: {
  entries: [string, number][];
  labelColor: (k: string) => string;
  bgColor: (k: string) => string;
  borderColor?: (k: string) => string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-3)" }}>
        No data yet.
      </p>
    );
  }
  const max = Math.max(...entries.map(([, c]) => c));
  return (
    <div className="flex flex-col gap-3">
      {entries.map(([key, count]) => (
        <div key={key} className="flex items-center gap-3">
          <span
            className="mono w-28 shrink-0 text-right text-[11px] uppercase"
            style={{ color: labelColor(key) }}
          >
            {key}
          </span>
          <div
            className="h-5 rounded transition-all"
            style={{
              width: `${Math.max(4, (count / max) * 100)}%`,
              background: bgColor(key),
              border: `1px solid ${borderColor ? borderColor(key) : `${labelColor(key)}30`}`,
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

function ScoreDistributionChart({ buckets }: { buckets: ScoreDistributionBucket[] }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const bucketColor = (b: string) => {
    if (b === "0-4") return "#ef4444";
    if (b === "4-6") return "#f59e0b";
    if (b === "6-8") return "#60a5fa";
    return "var(--green)";
  };
  return (
    <div className="flex flex-col gap-3">
      {buckets.map((b) => (
        <div key={b.bucket} className="flex items-center gap-3">
          <span
            className="mono w-12 shrink-0 text-right text-[11px]"
            style={{ color: bucketColor(b.bucket) }}
          >
            {b.bucket}
          </span>
          <div
            className="h-5 rounded"
            style={{
              width: `${Math.max(4, (b.count / max) * 100)}%`,
              background: `${bucketColor(b.bucket)}22`,
              border: `1px solid ${bucketColor(b.bucket)}50`,
              minWidth: "4px",
            }}
          />
          <span className="mono text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
            {b.count}
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
            style={{ background: "var(--surface2)", color: "var(--text-2)" }}
          >
            {count}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  return (
    <span
      className="mono rounded px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{
        color: scoreToColor(score),
        background: `${scoreToColor(score)}1a`,
      }}
    >
      {score.toFixed(1)}
    </span>
  );
}

function HireBadge({ decision }: { decision: string | null }) {
  if (!decision) return null;
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{
        background: getHireBg(decision),
        color: getHireColor(decision),
        border: `1px solid ${getHireColor(decision)}60`,
      }}
    >
      {decision}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  const color =
    type === "technical"
      ? "#60a5fa"
      : type === "behavioral"
        ? "#a78bfa"
        : "var(--green)";
  return (
    <span
      className="mono rounded-full px-2 py-0.5 text-[10px] capitalize"
      style={{
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {type}
    </span>
  );
}

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 200ms",
        flexShrink: 0,
      }}
    >
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// All Sessions Table
// ---------------------------------------------------------------------------

function AllSessionsTable({ sessions, accessToken }: { sessions: AdminSession[]; accessToken: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <p className="p-6 text-sm" style={{ color: "var(--text-3)" }}>
        No sessions yet.
      </p>
    );
  }

  return (
    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
      {/* Table header */}
      <div
        className="mono grid grid-cols-[1fr_1.2fr_1fr_0.8fr_0.7fr_0.8fr] gap-3 px-5 py-2 text-[10px] uppercase tracking-wider"
        style={{ color: "var(--text-3)", background: "var(--surface2)" }}
      >
        <span>Date</span>
        <span>User</span>
        <span>Role @ Company</span>
        <span>Type</span>
        <span>Score</span>
        <span>Hire</span>
      </div>

      {sessions.map((s) => {
        const open = expandedId === s.id;
        const date = fmtDate(s.created_at);
        return (
          <div key={s.id} style={{ borderColor: "var(--border)" }}>
            {/* Row */}
            <button
              className="grid w-full grid-cols-[1fr_1.2fr_1fr_0.8fr_0.7fr_0.8fr] items-center gap-3 px-5 py-3 text-left transition-colors"
              style={{
                background: open ? "var(--surface2)" : "transparent",
              }}
              onMouseEnter={(e) =>
                !open && ((e.currentTarget.style.background = "var(--surface2)"))
              }
              onMouseLeave={(e) =>
                !open && ((e.currentTarget.style.background = "transparent"))
              }
              onClick={() => setExpandedId(open ? null : s.id)}
            >
              <span
                className="mono flex items-center gap-1.5 text-[11px]"
                style={{ color: "var(--text-3)" }}
              >
                <ExpandIcon open={open} />
                {date}
              </span>
              <span className="truncate text-xs" style={{ color: "var(--text-2)" }}>
                {s.userEmail}
              </span>
              <span className="truncate text-sm font-medium">
                {s.role || "Untitled"}
                <span style={{ color: "var(--text-3)" }}> @ </span>
                {s.company || "—"}
              </span>
              <span>{s.interviewType ? <TypePill type={s.interviewType} /> : "—"}</span>
              <span>
                <ScoreBadge score={s.overall_score} />
              </span>
              <span>
                <HireBadge decision={s.hire_decision} />
              </span>
            </button>

            {/* Expandable detail */}
            <SessionDetail session={s} open={open} accessToken={accessToken} />
          </div>
        );
      })}
    </div>
  );
}

function SessionDetail({ session: s, open, accessToken }: { session: AdminSession; open: boolean; accessToken: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [webmUrl, setWebmUrl] = useState<string | null>(null);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingChecked, setRecordingChecked] = useState(false);
  const [behavioral, setBehavioral] = useState<BehavioralPayload | null>(null);
  const [behavioralLoading, setBehavioralLoading] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    setHeight(open ? ref.current.scrollHeight : 0);
  }, [open, s.rounds.length, webmUrl, mp4Url, behavioral]);

  useEffect(() => {
    if (!open || recordingChecked) return;
    setRecordingChecked(true);
    setRecordingLoading(true);
    setBehavioralLoading(true);
    fetchAdminRecordingUrl({ data: { accessToken, userId: s.userId, sessionId: s.id } })
      .then((res: any) => { setWebmUrl(res.webmUrl ?? null); setMp4Url(res.mp4Url ?? null); })
      .catch(() => {})
      .finally(() => setRecordingLoading(false));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAdminBehavioral({ data: { accessToken, userId: s.userId, sessionId: s.id } })
      .then((res: any) => { if (res?.ok && res?.data) setBehavioral(res.data as BehavioralPayload); })
      .catch(() => {})
      .finally(() => setBehavioralLoading(false));
  }, [open, recordingChecked, accessToken, s.userId, s.id]);

  return (
    <div
      style={{
        maxHeight: open ? `${height}px` : "0px",
        overflow: "hidden",
        transition: "max-height 300ms ease",
        borderTop: open ? `1px solid var(--border)` : "none",
      }}
    >
      <div ref={ref} className="px-5 py-4">
        {/* Recording */}
        <div className="mb-5">
          <div className="mono mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            Interview Recording
          </div>
          {recordingLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, fontSize: 12, color: "var(--text-2)" }}>
              <span className="gp-spinner" /> Fetching recording…
            </div>
          ) : (webmUrl || mp4Url) ? (
            <video
              controls
              style={{ width: "100%", maxHeight: 280, borderRadius: 10, background: "#000", display: "block" }}
            >
              {webmUrl && <source src={webmUrl} type="video/webm" />}
              {mp4Url && <source src={mp4Url} type="video/mp4" />}
            </video>
          ) : (
            <div style={{ height: 44, display: "flex", alignItems: "center", fontSize: 12, color: "var(--text-3)", background: "var(--surface3)", borderRadius: 8, paddingLeft: 12, border: "1px dashed var(--border)" }}>
              No recording for this session
            </div>
          )}
        </div>

        {/* Behavioral analytics */}
        <BehavioralSection data={behavioral} loading={behavioralLoading} />

        {/* Interviewers panel */}
        {s.interviewers.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {s.interviewers.map((iv, i) => (
              <div
                key={i}
                className="rounded border px-3 py-1.5 text-xs"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface2)",
                  color: "var(--text-2)",
                }}
              >
                <span className="font-semibold" style={{ color: "var(--green)" }}>
                  {iv.name}
                </span>
                {iv.title && (
                  <span style={{ color: "var(--text-3)" }}> · {iv.title}</span>
                )}
                {iv.focus && (
                  <span style={{ color: "var(--text-3)" }}> · {iv.focus}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Report-level strengths / weaknesses */}
        {(s.strengths.length > 0 || s.weaknesses.length > 0) && (
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {s.strengths.length > 0 && (
              <div>
                <div
                  className="mono mb-1 text-[10px] uppercase tracking-wider"
                  style={{ color: "#4ade80" }}
                >
                  Strengths
                </div>
                <ul className="flex flex-col gap-0.5">
                  {s.strengths.map((st, i) => (
                    <li key={i} className="text-xs" style={{ color: "var(--text-2)" }}>
                      · {st}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.weaknesses.length > 0 && (
              <div>
                <div
                  className="mono mb-1 text-[10px] uppercase tracking-wider"
                  style={{ color: "#f87171" }}
                >
                  Weaknesses
                </div>
                <ul className="flex flex-col gap-0.5">
                  {s.weaknesses.map((w, i) => (
                    <li key={i} className="text-xs" style={{ color: "var(--text-2)" }}>
                      · {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Rounds */}
        {s.rounds.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            <div
              className="mono text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              Rounds ({s.rounds.length})
            </div>
            {s.rounds.map((r, i) => (
              <RoundCard key={i} round={r} />
            ))}
          </div>
        )}

        {/* Study plan */}
        {s.studyPlan && (
          <div className="mb-4">
            <div
              className="mono mb-1 text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              Study Plan
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
              {s.studyPlan}
            </p>
          </div>
        )}

        {/* Drill questions */}
        {s.drillQuestions.length > 0 && (
          <div className="mb-4">
            <div
              className="mono mb-1 text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              Drill Questions
            </div>
            <ul className="flex flex-col gap-0.5">
              {s.drillQuestions.map((q, i) => (
                <li key={i} className="text-xs" style={{ color: "var(--text-2)" }}>
                  {i + 1}. {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Job Description */}
        {s.jobDescription && (
          <div className="mb-4">
            <div className="mono mb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              Job Description
            </div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-2)", maxHeight: "120px", overflowY: "auto" }}>
              {s.jobDescription}
            </p>
          </div>
        )}

        {/* Resume */}
        {s.resume && (
          <div className="mb-4">
            <div className="mono mb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              Resume
            </div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-2)", maxHeight: "180px", overflowY: "auto", background: "var(--surface3)", borderRadius: "8px", padding: "10px" }}>
              {s.resume}
            </p>
          </div>
        )}

        {/* View full report link */}
        <a
          href={`/report/${s.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mono inline-flex items-center gap-1 text-[11px] uppercase tracking-wider transition-opacity hover:opacity-70"
          style={{ color: "var(--green)" }}
        >
          View full report →
        </a>
      </div>
    </div>
  );
}

function RoundCard({ round: r }: { round: { index: number; interviewerName: string; topic: string; difficulty: string; stage: string; turnType: string; clarity: number; technicalDepth: number; structure: number; overall: number; strengths: string[]; weaknesses: string[]; answerSummary: string; answer: string; question: string } }) {
  return (
    <div
      className="rounded border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface2)" }}
    >
      {/* Round header */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="mono text-[10px] uppercase"
          style={{ color: "var(--text-3)" }}
        >
          #{r.index + 1}
        </span>
        {r.interviewerName && (
          <span className="text-xs font-semibold" style={{ color: "var(--green)" }}>
            {r.interviewerName}
          </span>
        )}
        {r.topic && (
          <span className="text-xs" style={{ color: "var(--text-2)" }}>
            {r.topic}
          </span>
        )}
        {r.difficulty && (
          <span
            className="mono rounded-full px-2 py-0.5 text-[10px] capitalize"
            style={{
              background:
                r.difficulty === "hard"
                  ? "rgba(239,68,68,0.12)"
                  : r.difficulty === "medium"
                    ? "rgba(245,158,11,0.12)"
                    : "rgba(74,222,128,0.12)",
              color:
                r.difficulty === "hard"
                  ? "#ef4444"
                  : r.difficulty === "medium"
                    ? "#f59e0b"
                    : "#4ade80",
            }}
          >
            {r.difficulty}
          </span>
        )}
        {r.stage && (
          <span
            className="mono text-[10px]"
            style={{ color: "var(--text-3)" }}
          >
            {r.stage.replace(/_/g, " ")}
          </span>
        )}
        {r.turnType && (
          <span
            className="mono text-[10px]"
            style={{ color: "var(--text-3)" }}
          >
            · {r.turnType.replace(/_/g, " ")}
          </span>
        )}
        {/* Score mini bar */}
        <div className="ml-auto flex items-center gap-2">
          {[
            { label: "C", val: r.clarity },
            { label: "T", val: r.technicalDepth },
            { label: "S", val: r.structure },
          ].map(({ label, val }) => (
            <div key={label} className="flex items-center gap-1">
              <span
                className="mono text-[9px]"
                style={{ color: "var(--text-3)" }}
              >
                {label}
              </span>
              <span
                className="mono text-[10px] tabular-nums"
                style={{ color: scoreToColor(val) }}
              >
                {val.toFixed(1)}
              </span>
            </div>
          ))}
          <ScoreBadge score={r.overall} />
        </div>
      </div>

      {/* Question */}
      {r.question && (
        <p
          className="mb-2 text-xs italic leading-relaxed"
          style={{ color: "var(--text-3)" }}
        >
          "{r.question}"
        </p>
      )}

      {/* Full answer */}
      {r.answer && (
        <div className="mb-2">
          <div className="mono mb-0.5 text-[9px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            Their answer
          </div>
          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-1)" }}>
            {r.answer}
          </p>
        </div>
      )}

      {/* Answer summary */}
      {r.answerSummary && (
        <div className="mb-2">
          <div className="mono mb-0.5 text-[9px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            AI summary
          </div>
          <p className="text-xs leading-relaxed italic" style={{ color: "var(--text-2)" }}>
            {r.answerSummary}
          </p>
        </div>
      )}

      {/* Strengths / weaknesses */}
      {(r.strengths.length > 0 || r.weaknesses.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-4">
          {r.strengths.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {r.strengths.map((st, i) => (
                <li key={i} className="text-[11px]" style={{ color: "#4ade80" }}>
                  + {st}
                </li>
              ))}
            </ul>
          )}
          {r.weaknesses.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {r.weaknesses.map((w, i) => (
                <li key={i} className="text-[11px]" style={{ color: "#f87171" }}>
                  − {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All Users Table
// ---------------------------------------------------------------------------

function AllUsersTable({
  users,
  sessions,
}: {
  users: AdminUser[];
  sessions: AdminSession[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Index sessions by userId for quick lookup
  const sessionsByUser = sessions.reduce<Record<string, AdminSession[]>>((acc, s) => {
    if (!acc[s.userId]) acc[s.userId] = [];
    acc[s.userId].push(s);
    return acc;
  }, {});

  if (users.length === 0) {
    return (
      <p className="p-6 text-sm" style={{ color: "var(--text-3)" }}>
        No users yet.
      </p>
    );
  }

  return (
    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
      {/* Header */}
      <div
        className="mono grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2 text-[10px] uppercase tracking-wider"
        style={{ color: "var(--text-3)", background: "var(--surface2)" }}
      >
        <span>User</span>
        <span>Joined</span>
        <span>Last Sign-in</span>
        <span>Interviews</span>
        <span>Avg / Best</span>
        <span>Types</span>
      </div>

      {users.map((u) => {
        const open = expandedId === u.id;
        const userSessions = sessionsByUser[u.id] ?? [];
        return (
          <div key={u.id} style={{ borderColor: "var(--border)" }}>
            <button
              className="grid w-full grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-3 px-5 py-3 text-left transition-colors"
              style={{ background: open ? "var(--surface2)" : "transparent" }}
              onMouseEnter={(e) =>
                !open && ((e.currentTarget.style.background = "var(--surface2)"))
              }
              onMouseLeave={(e) =>
                !open && ((e.currentTarget.style.background = "transparent"))
              }
              onClick={() => setExpandedId(open ? null : u.id)}
            >
              {/* Avatar + name + email */}
              <span className="flex min-w-0 items-center gap-2">
                <ExpandIcon open={open} />
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: "var(--green-dim)", color: "var(--green)" }}
                >
                  {u.name[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{u.name}</span>
                  <span
                    className="block truncate text-xs"
                    style={{ color: "var(--text-3)" }}
                  >
                    {u.email}
                  </span>
                </span>
              </span>

              {/* Joined */}
              <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
                {fmtDateShort(u.createdAt)}
              </span>

              {/* Last sign-in */}
              <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
                {u.lastSignIn ? fmtDateShort(u.lastSignIn) : "—"}
              </span>

              {/* Interview count */}
              <span>
                <span
                  className="mono rounded-full px-2 py-0.5 text-[11px] tabular-nums"
                  style={{
                    background: "var(--surface2)",
                    color: u.interviewCount > 0 ? "var(--green)" : "var(--text-3)",
                  }}
                >
                  {u.interviewCount}
                </span>
              </span>

              {/* Avg / best */}
              <span className="flex items-center gap-1.5">
                <ScoreBadge score={u.avgScore} />
                {u.bestScore !== null && u.bestScore !== u.avgScore && (
                  <>
                    <span className="mono text-[10px]" style={{ color: "var(--text-3)" }}>
                      /
                    </span>
                    <ScoreBadge score={u.bestScore} />
                  </>
                )}
              </span>

              {/* Interview types */}
              <span className="flex flex-wrap gap-1">
                {u.interviewTypes.map((t) => (
                  <TypePill key={t} type={t} />
                ))}
              </span>
            </button>

            {/* Expandable: user's sessions */}
            <UserSessionsDetail
              open={open}
              userId={u.id}
              sessions={userSessions}
              lastInterview={u.lastInterview}
            />
          </div>
        );
      })}
    </div>
  );
}

function UserSessionsDetail({
  open,
  userId: _userId,
  sessions,
  lastInterview,
}: {
  open: boolean;
  userId: string;
  sessions: AdminSession[];
  lastInterview: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    setHeight(open ? ref.current.scrollHeight : 0);
  }, [open, sessions.length]);

  return (
    <div
      style={{
        maxHeight: open ? `${height}px` : "0px",
        overflow: "hidden",
        transition: "max-height 300ms ease",
        borderTop: open ? `1px solid var(--border)` : "none",
      }}
    >
      <div ref={ref} className="px-5 py-4">
        {lastInterview && (
          <div className="mono mb-3 text-[10px]" style={{ color: "var(--text-3)" }}>
            Last interview: {fmtDate(lastInterview)}
          </div>
        )}
        {sessions.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            No sessions recorded for this user.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {s.role || "Untitled"}
                    <span style={{ color: "var(--text-3)" }}> @ </span>
                    {s.company || "—"}
                  </div>
                  <div
                    className="mono mt-0.5 text-[10px]"
                    style={{ color: "var(--text-3)" }}
                  >
                    {fmtDate(s.created_at)}
                    {s.interviewType ? ` · ${s.interviewType}` : ""}
                    {s.totalRounds ? ` · ${s.totalRounds} rounds` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge score={s.overall_score} />
                  <HireBadge decision={s.hire_decision} />
                  <a
                    href={`/report/${s.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono text-[11px] transition-opacity hover:opacity-70"
                    style={{ color: "var(--green)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    view →
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Behavioral analytics section
// ---------------------------------------------------------------------------

function BehavioralSection({ data, loading }: { data: BehavioralPayload | null; loading: boolean }) {
  const [fpOpen, setFpOpen] = useState(false);
  const [rhythmOpen, setRhythmOpen] = useState(false);

  if (loading) return (
    <div className="mb-5">
      <div className="mono mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Behavioral Data</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}><span className="gp-spinner" /> Loading…</div>
    </div>
  );

  if (!data) return (
    <div className="mb-5">
      <div className="mono mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Behavioral Data</div>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>No behavioral data — session predates tracking.</div>
    </div>
  );

  const { summary, fingerprint, pasteEvents, rightClickEvents, tabEvents, questions, copyEvents, selectionEvents, mouseIdlePeriods, mouseClicks } = data;
  const flags = [
    summary.totalTabSwitches > 2 && `${summary.totalTabSwitches} tab switches`,
    summary.totalPastes > 0 && `${summary.totalPastes} paste(s)`,
    summary.totalCopies > 0 && `${summary.totalCopies} copy event(s)`,
    summary.totalTimeHiddenMs > 30000 && `${fmtMs(summary.totalTimeHiddenMs)} hidden`,
    fingerprint.adBlockerDetected && "ad blocker",
    fingerprint.localIP && fingerprint.localIP.startsWith("10.") && "possible VPN",
  ].filter(Boolean) as string[];

  const outsideClicks = mouseClicks.filter(c => c.target === "outside").length;

  return (
    <div className="mb-5" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
      {/* Header + flags */}
      <div className="mono mb-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        Behavioral Analytics
        {flags.map((f, i) => (
          <span key={i} style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>⚠ {f}</span>
        ))}
      </div>

      {/* Summary pills row 1 — cheating signals */}
      <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>CHEATING SIGNALS</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <BPill label="Tab Switches" value={summary.totalTabSwitches} danger={summary.totalTabSwitches > 2} />
        <BPill label="Time Hidden" value={fmtMs(summary.totalTimeHiddenMs)} danger={summary.totalTimeHiddenMs > 30000} />
        <BPill label="Pastes" value={summary.totalPastes} danger={summary.totalPastes > 0} />
        <BPill label="Copies" value={summary.totalCopies} danger={summary.totalCopies > 0} />
        <BPill label="Right Clicks" value={summary.totalRightClicks} danger={summary.totalRightClicks > 3} />
        <BPill label="Selections" value={summary.totalSelections} />
        <BPill label="Clicks Outside Box" value={outsideClicks} danger={outsideClicks > 5} />
      </div>

      {/* Summary pills row 2 — typing */}
      <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>TYPING BEHAVIOR</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <BPill label="Avg WPM" value={summary.avgWpm} />
        <BPill label="Avg Backspace%" value={`${summary.avgBackspaceRate}%`} danger={summary.avgBackspaceRate > 25} />
        <BPill label="Mouse Idle" value={fmtMs(summary.totalMouseIdleMs)} />
        <BPill label="Scroll Events" value={summary.totalScrollEvents} />
        {fingerprint.adBlockerDetected && <BPill label="Ad Blocker" value="Yes" danger />}
        {fingerprint.hasVisitedBefore && <BPill label="Return Visitor" value={`Visit #${fingerprint.visitCount + 1}`} />}
      </div>

      {/* Per-question table */}
      {questions.length > 0 && (
        <div style={{ marginBottom: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 640 }}>
            <thead>
              <tr style={{ color: "var(--text-3)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                {["Q#","1st Key","WPM","Bksp%","Pauses","Tab Sw","Pastes","Fillers","Correction Bursts","Rhythm σ"].map(h => (
                  <th key={h} style={{ padding: "3px 8px 3px 0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.qIdx} style={{ borderBottom: "1px solid var(--border)", color: "var(--text-2)" }}>
                  <td style={{ padding: "4px 8px 4px 0", fontWeight: 700 }}>{q.qIdx + 1}</td>
                  <td style={{ padding: "4px 8px", color: q.timeToFirstKeystrokeMs !== null && q.timeToFirstKeystrokeMs > 15000 ? "#fca5a5" : undefined }}>
                    {q.timeToFirstKeystrokeMs !== null ? fmtMs(q.timeToFirstKeystrokeMs) : "—"}
                  </td>
                  <td style={{ padding: "4px 8px" }}>{q.wpm || "—"}</td>
                  <td style={{ padding: "4px 8px", color: q.backspaceRate > 30 ? "#fca5a5" : undefined }}>{q.backspaceRate}%</td>
                  <td style={{ padding: "4px 8px" }}>{q.pauseCount > 0 ? `${q.pauseCount} (${fmtMs(q.longestPauseMs)})` : "—"}</td>
                  <td style={{ padding: "4px 8px", color: q.tabSwitchesWhileAnswering > 0 ? "#fca5a5" : undefined }}>{q.tabSwitchesWhileAnswering || "—"}</td>
                  <td style={{ padding: "4px 8px", color: q.pasteCount > 0 ? "#fca5a5" : undefined }}>{q.pasteCount || "—"}</td>
                  <td style={{ padding: "4px 8px", color: q.fillerRate > 5 ? "#fca5a5" : undefined }}>{q.fillerRate > 0 ? `${q.fillerRate}%` : "—"}</td>
                  <td style={{ padding: "4px 8px", color: q.correctionBursts > 2 ? "#fca5a5" : undefined }}>{q.correctionBursts || "—"}</td>
                  <td style={{ padding: "4px 8px" }}>{q.keystrokeRhythmVariance > 0 ? `${q.keystrokeRhythmVariance}ms²` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Flagged event details */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        {pasteEvents.length > 0 && (
          <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>Paste Events</div>
            {pasteEvents.map((p, i) => (
              <div key={i} style={{ fontSize: 11, color: "var(--text-2)" }}>Q{p.qIdx + 1} — pasted {p.pastedLen} chars (had {p.answerLenBefore} chars typed)</div>
            ))}
          </div>
        )}

        {copyEvents.length > 0 && (
          <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>Copy Events</div>
            {copyEvents.map((c, i) => (
              <div key={i} style={{ fontSize: 11, color: "var(--text-2)" }}>Q{c.qIdx + 1} — copied: "{c.copiedText}"</div>
            ))}
          </div>
        )}

        {selectionEvents.length > 0 && (
          <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>Text Selections (highlighted question text)</div>
            {selectionEvents.slice(0, 5).map((s, i) => (
              <div key={i} style={{ fontSize: 11, color: "var(--text-2)" }}>Q{s.qIdx + 1} — "{s.selectedText}"</div>
            ))}
            {selectionEvents.length > 5 && <div style={{ fontSize: 11, color: "var(--text-3)" }}>+{selectionEvents.length - 5} more</div>}
          </div>
        )}

        {summary.totalTabSwitches > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>Tab switches by question:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {tabEvents.filter(e => e.type === "hidden").map((e, i) => (
                <span key={i} style={{ fontSize: 10, background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: "1px 6px" }}>Q{e.qIdx + 1}</span>
              ))}
            </div>
          </div>
        )}

        {mouseIdlePeriods.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
            Mouse idle periods: {mouseIdlePeriods.map((m, i) => `Q${m.qIdx + 1} (${fmtMs(m.duration)})`).join(", ")}
          </div>
        )}

        {rightClickEvents.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
            Right-clicks: {rightClickEvents.map(r => `Q${r.qIdx + 1}`).join(", ")}
          </div>
        )}
      </div>

      {/* Typing rhythm (collapsible) */}
      <button onClick={() => setRhythmOpen(o => !o)} style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 4 }}>
        {rhythmOpen ? "▲ Hide" : "▼ Show"} keystroke rhythm intervals
      </button>
      {rhythmOpen && questions.map(q => q.interKeystrokeIntervals.length > 0 && (
        <div key={q.qIdx} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>Q{q.qIdx + 1} intervals (ms) — avg {q.avgInterKeystrokeMs}ms</div>
          <div style={{ fontSize: 10, color: "var(--text-2)", wordBreak: "break-all", lineHeight: 1.6 }}>
            {q.interKeystrokeIntervals.slice(0, 60).join(" · ")}
            {q.interKeystrokeIntervals.length > 60 && ` … +${q.interKeystrokeIntervals.length - 60} more`}
          </div>
        </div>
      ))}

      {/* Device fingerprint (collapsible) */}
      <button onClick={() => setFpOpen(o => !o)} style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "4px 0 0" }}>
        {fpOpen ? "▲ Hide" : "▼ Show"} device fingerprint
      </button>
      {fpOpen && (
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "140px 1fr", gap: "3px 12px", fontSize: 11, color: "var(--text-2)" }}>
          <FPRow label="Screen" value={`${fingerprint.screenWidth}×${fingerprint.screenHeight} @${fingerprint.devicePixelRatio}x`} />
          <FPRow label="Timezone" value={fingerprint.timezone} />
          <FPRow label="Languages" value={(fingerprint.languages ?? [fingerprint.language]).join(", ")} />
          <FPRow label="Platform" value={fingerprint.platform} />
          <FPRow label="CPU Cores" value={String(fingerprint.hardwareConcurrency)} />
          <FPRow label="RAM" value={fingerprint.deviceMemory != null ? `${fingerprint.deviceMemory} GB` : "—"} />
          <FPRow label="Color Depth" value={`${fingerprint.colorDepth}-bit`} />
          <FPRow label="Touch Points" value={String(fingerprint.touchPoints)} />
          <FPRow label="Dark Mode" value={fingerprint.darkMode ? "Yes" : "No"} />
          <FPRow label="Reduced Motion" value={fingerprint.reducedMotion ? "Yes" : "No"} />
          <FPRow label="Do Not Track" value={fingerprint.doNotTrack ?? "unset"} />
          <FPRow label="Ad Blocker" value={fingerprint.adBlockerDetected ? "Detected" : "No"} />
          <FPRow label="PDF Viewer" value={fingerprint.pdfViewerEnabled ? "Yes" : "No"} />
          <FPRow label="Local IP" value={fingerprint.localIP ?? "—"} />
          <FPRow label="Visit Count" value={`#${(fingerprint.visitCount ?? 0) + 1}${fingerprint.hasVisitedBefore ? " (return)" : " (new)"}`} />
          {fingerprint.connection && <FPRow label="Network" value={`${fingerprint.connection.effectiveType} / ${fingerprint.connection.downlink}Mbps / ${fingerprint.connection.rtt}ms RTT`} />}
          {fingerprint.battery && <FPRow label="Battery" value={`${fingerprint.battery.level}% ${fingerprint.battery.charging ? "⚡charging" : ""}`} />}
          {fingerprint.webgl && <FPRow label="GPU" value={fingerprint.webgl.renderer} />}
          {fingerprint.detectedFonts && fingerprint.detectedFonts.length > 0 && <FPRow label="Fonts" value={fingerprint.detectedFonts.join(", ")} />}
          {fingerprint.canvasFingerprint && <FPRow label="Canvas FP" value={fingerprint.canvasFingerprint} />}
          <FPRow label="Browser" value={fingerprint.userAgent.slice(0, 80)} />
          {fingerprint.referrer && <FPRow label="Referrer" value={fingerprint.referrer} />}
        </div>
      )}

      {/* Consent + Location */}
      {data.consent && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6 }}>CONSENT GIVEN</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <BPill label="Microphone" value={data.consent.microphone ? "Yes" : "No"} />
            <BPill label="Camera" value={data.consent.camera ? "Yes" : "No"} />
            <BPill label="Location" value={data.consent.location ? "Yes" : "No"} />
            {data.location && (
              <BPill label="GPS" value={`${data.location.lat}, ${data.location.lng} (±${data.location.accuracy}m)`} />
            )}
          </div>
        </div>
      )}

      {/* Microphone data */}
      <MicrophoneSection mic={(data as any).microphone} />

      {/* Camera data */}
      <CameraSection cam={(data as any).camera} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outreach section
// ---------------------------------------------------------------------------

function OutreachSection({
  users,
  logs,
  accessToken,
}: {
  users: AdminUser[];
  logs: AdminOutreachLog[];
  accessToken: string;
}) {
  const inactive = users.filter((u) => u.interviewCount === 0);
  const successfulCheckIns = new Map(
    logs
      .filter((log) => log.kind === "check_in" && log.status === "sent" && log.userId)
      .map((log) => [log.userId as string, log]),
  );
  const unsentInactive = inactive.filter((u) => !successfulCheckIns.has(u.id));
  const [selected, setSelected] = useState<Set<string>>(
    new Set(unsentInactive.map((u) => u.id)),
  );
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<CheckInResult[] | null>(null);
  const [preview, setPreview] = useState(false);
  const sentCount = inactive.length - unsentInactive.length;
  const progress = inactive.length > 0 ? (sentCount / inactive.length) * 100 : 100;

  useEffect(() => {
    setSelected(new Set(unsentInactive.map((u) => u.id)));
  }, [logs, users]);

  function toggleAll() {
    if (selected.size === unsentInactive.length) setSelected(new Set());
    else setSelected(new Set(unsentInactive.map((u) => u.id)));
  }

  async function handleSend() {
    if (!selected.size || sending) return;
    setSending(true);
    setResults(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await sendAdminCheckInEmails({ data: { accessToken, userIds: Array.from(selected) } }) as any;
      setResults(res.results ?? []);
    } catch (e) {
      console.error("[outreach] send failed", e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mono mb-4 flex items-center justify-between text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        <span>Outreach — Never Interviewed ({inactive.length})</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPreview((v) => !v)}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-2)", cursor: "pointer", textTransform: "none", letterSpacing: 0 }}
          >
            {preview ? "Hide preview" : "Preview email"}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || selected.size === 0}
            style={{ fontSize: 11, padding: "4px 14px", borderRadius: 6, border: "none", background: selected.size === 0 ? "var(--surface3)" : "var(--green)", color: selected.size === 0 ? "var(--text-3)" : "#000", cursor: selected.size === 0 ? "default" : "pointer", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}
          >
            {sending ? "Sending…" : `Send check-in to ${selected.size}`}
          </button>
        </div>
      </div>

      <div className="gp-card mb-4 p-4">
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--text-2)" }}>
          <span>{sentCount} already sent</span>
          <span>{unsentInactive.length} remaining</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--surface3)", overflow: "hidden" }}>
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: 999,
              background: "var(--green)",
              transition: "width 180ms ease",
            }}
          />
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>
          People who already got a successful check-in are not selected by default. The server also skips them if they slip into a send batch.
        </p>
      </div>

      {/* Email preview */}
      {preview && (
        <div className="gp-card mb-4 p-5" style={{ fontSize: 13 }}>
          <div style={{ color: "var(--text-3)", marginBottom: 8, fontSize: 11 }}>EMAIL PREVIEW</div>
          <div style={{ color: "var(--text-2)", marginBottom: 4 }}><strong>Subject:</strong> hey [name], still up for that mock interview?</div>
          <div style={{ color: "var(--text-2)", marginBottom: 4 }}><strong>From:</strong> Abhishek &lt;abhishek@send.mocki.dev&gt;</div>
          <div style={{ color: "var(--text-3)", marginTop: 8, lineHeight: 1.6 }}>
            "Still thinking about that interview, [name]? You signed up for Mocki but haven't run a session yet. It takes about 15 minutes…"
            <span style={{ marginLeft: 6, color: "var(--green)" }}>→ Start your first interview</span>
          </div>
        </div>
      )}

      {inactive.length === 0 ? (
        <div className="gp-card p-6 text-center" style={{ color: "var(--text-3)", fontSize: 13 }}>
          All users have completed at least one interview 🎉
        </div>
      ) : (
        <div className="gp-card overflow-hidden p-0">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", width: 36 }}>
                  <input type="checkbox" checked={unsentInactive.length > 0 && selected.size === unsentInactive.length} onChange={toggleAll} style={{ cursor: "pointer" }} />
                </th>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "var(--text-3)", fontWeight: 600 }}>Email</th>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "var(--text-3)", fontWeight: 600 }}>Name</th>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "var(--text-3)", fontWeight: 600 }}>Signed up</th>
                <th style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-3)", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {inactive.map((u) => {
                const result = results?.find((r) => r.userId === u.id);
                const alreadySent = successfulCheckIns.get(u.id);
                const isSelected = selected.has(u.id);
                return (
                  <tr
                    key={u.id}
                    style={{ borderBottom: "1px solid var(--border)", background: isSelected ? "rgba(118,185,0,0.03)" : undefined, cursor: "pointer" }}
                    onClick={() => {
                      if (alreadySent) return;
                      setSelected((prev) => {
                        const next = new Set(prev);
                        isSelected ? next.delete(u.id) : next.add(u.id);
                        return next;
                      });
                    }}
                  >
                    <td style={{ padding: "10px 16px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={Boolean(alreadySent)}
                        onChange={() => {}}
                        style={{ cursor: alreadySent ? "not-allowed" : "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "10px 8px", color: "var(--text)" }}>{u.email}</td>
                    <td style={{ padding: "10px 8px", color: "var(--text-2)" }}>{u.name}</td>
                    <td style={{ padding: "10px 8px", color: "var(--text-3)" }}>
                      {new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {result ? (
                        result.status === "skipped"
                          ? <span style={{ color: "var(--text-3)", fontSize: 11 }}>Skipped — already sent</span>
                          : result.ok
                          ? <span style={{ color: "#86efac", fontSize: 11 }}>✓ Sent</span>
                          : (
                            <span
                              title={result.error ?? "unknown error"}
                              style={{ color: "#f87171", fontSize: 11, cursor: "help", borderBottom: "1px dotted #f87171" }}
                            >
                              ✗ Failed{result.error ? ` — ${result.error.length > 40 ? result.error.slice(0, 40) + "…" : result.error}` : ""}
                            </span>
                          )
                      ) : alreadySent ? (
                        <span title={new Date(alreadySent.createdAt).toLocaleString()} style={{ color: "#86efac", fontSize: 11, cursor: "help" }}>
                          ✓ Already sent
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)", fontSize: 11 }}>Not sent</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Results summary */}
      {results && (
        <div className="mt-3 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          ✓ {results.filter((r) => r.status === "sent").length} sent
          {results.filter((r) => r.status === "skipped").length > 0 && (
            <span style={{ color: "var(--text-3)", marginLeft: 12 }}>
              {results.filter((r) => r.status === "skipped").length} skipped
            </span>
          )}
          {results.filter((r) => r.status === "failed").length > 0 && (
            <span style={{ color: "#f87171", marginLeft: 12 }}>✗ {results.filter((r) => r.status === "failed").length} failed</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite section
// ---------------------------------------------------------------------------

function InviteSection({
  accessToken,
  logs,
}: {
  accessToken: string;
  logs: AdminOutreachLog[];
}) {
  const [raw, setRaw] = useState("srijapalla1960@gmail.com\ndhaya.nadhana@gmail.com");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  const emails = raw
    .split(/[\n,\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
  const sentInvites = new Map(
    logs
      .filter((log) => log.kind === "invite" && log.status === "sent")
      .map((log) => [log.email.toLowerCase(), log]),
  );
  const alreadySent = emails.filter((email) => sentInvites.has(email.toLowerCase())).length;
  const remaining = emails.length - alreadySent;

  async function handleSend() {
    if (!emails.length || sending) return;
    setSending(true);
    setResults(null);
    try {
      const res = await sendAdminInviteEmails({ data: { accessToken, emails } }) as any;
      setResults(res.results ?? []);
    } catch (e) {
      console.error("[invites] send failed", e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div
        className="mono mb-4 flex items-center justify-between text-[11px] uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        <span>Invites</span>
        <button
          onClick={handleSend}
          disabled={sending || emails.length === 0}
          style={{
            fontSize: 11, padding: "4px 14px", borderRadius: 6, border: "none",
            background: emails.length === 0 ? "var(--surface3)" : "var(--green)",
            color: emails.length === 0 ? "var(--text-3)" : "#000",
            cursor: emails.length === 0 ? "default" : "pointer",
            fontWeight: 700, textTransform: "none", letterSpacing: 0,
          }}
        >
          {sending ? "Sending…" : `Send invite to ${emails.length}`}
        </button>
      </div>

      <div className="gp-card p-5">
        <p className="mb-3 text-xs" style={{ color: "var(--text-3)" }}>
          One email per line, or comma-separated. These people haven't signed up yet — they'll get a personal invite from you.
        </p>
        {emails.length > 0 && (
          <div className="mb-4 rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
            <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--text-2)" }}>
              <span>{alreadySent} already invited</span>
              <span>{remaining} new</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: "var(--surface3)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${emails.length ? (alreadySent / emails.length) * 100 : 0}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "var(--green)",
                }}
              />
            </div>
          </div>
        )}
        <textarea
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setResults(null); }}
          rows={5}
          placeholder="friend@example.com&#10;another@example.com"
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical",
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "10px 12px", fontSize: 13,
            color: "var(--text)", fontFamily: "inherit", outline: "none",
          }}
        />

        {/* Parsed preview */}
        {emails.length > 0 && !results && (
          <div className="mt-3 flex flex-wrap gap-2">
            {emails.map((e) => (
              <span
                key={e}
                className="mono text-[11px] rounded-full px-2.5 py-0.5"
                title={sentInvites.has(e.toLowerCase()) ? "Already invited" : undefined}
                style={{
                  background: sentInvites.has(e.toLowerCase()) ? "rgba(118,185,0,0.08)" : "var(--surface3)",
                  border: sentInvites.has(e.toLowerCase()) ? "1px solid rgba(118,185,0,0.35)" : "1px solid var(--border)",
                  color: sentInvites.has(e.toLowerCase()) ? "var(--green)" : "var(--text-2)",
                }}
              >
                {e}{sentInvites.has(e.toLowerCase()) ? " · sent" : ""}
              </span>
            ))}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="mt-4 flex flex-col gap-2">
            {results.map((r) => (
              <div key={r.email} className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: "var(--text-2)" }}>{r.email}</span>
                {r.status === "skipped" ? (
                  <span style={{ color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap" }}>
                    Skipped — already sent
                  </span>
                ) : r.ok ? (
                  <span style={{ color: "#86efac", fontSize: 11, whiteSpace: "nowrap" }}>✓ Sent</span>
                ) : (
                  <span
                    title={r.error}
                    style={{ color: "#f87171", fontSize: 11, whiteSpace: "nowrap", cursor: "help", borderBottom: "1px dotted #f87171" }}
                  >
                    ✗ Failed{r.error ? ` — ${r.error.length > 40 ? r.error.slice(0, 40) + "…" : r.error}` : ""}
                  </span>
                )}
              </div>
            ))}
            <div className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>
              ✓ {results.filter((r) => r.status === "sent").length} sent
              {results.filter((r) => r.status === "skipped").length > 0 && (
                <span style={{ marginLeft: 10 }}>
                  {results.filter((r) => r.status === "skipped").length} skipped
                </span>
              )}
              {results.filter((r) => r.status === "failed").length > 0 && (
                <span style={{ color: "#f87171", marginLeft: 10 }}>
                  ✗ {results.filter((r) => r.status === "failed").length} failed
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BPill({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div style={{
      padding: "4px 10px", borderRadius: 6, fontSize: 11, border: "1px solid",
      borderColor: danger ? "rgba(239,68,68,0.35)" : "var(--border)",
      background: danger ? "rgba(239,68,68,0.08)" : "var(--surface3)",
      color: danger ? "#fca5a5" : "var(--text-2)",
    }}>
      <span style={{ color: danger ? "#f87171" : "var(--text-3)", marginRight: 4 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function FPRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "contents" }}>
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function MicrophoneSection({ mic }: { mic: import("@/hooks/useAudioAnalyzer").MicrophonePayload | null | undefined }) {
  if (!mic) return null;
  const avgWpm = mic.perQuestion.length
    ? Math.round(mic.perQuestion.reduce((s, q) => s + q.wpm, 0) / mic.perQuestion.length)
    : 0;
  const totalFillers = mic.perQuestion.reduce((s, q) => s + q.fillerWordTotal, 0);
  const totalSilence = mic.perQuestion.reduce((s, q) => s + q.silencePeriods, 0);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6 }}>MICROPHONE ANALYSIS</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <BPill label="Speech API" value={mic.speechApiAvailable ? "Available" : "Unavailable"} />
        <BPill label="Avg WPM" value={avgWpm} />
        <BPill label="Total Fillers" value={totalFillers} danger={totalFillers > 15} />
        <BPill label="Total Silence Periods" value={totalSilence} />
      </div>
      {mic.perQuestion.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
                {["Q#","WPM","Fillers","Filler/min","Avg Vol","Silence Periods","Silence Time","Speaking Time"].map(h => (
                  <th key={h} style={{ padding: "3px 8px 3px 0", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mic.perQuestion.map((q) => (
                <tr key={q.questionIndex} style={{ borderBottom: "1px solid var(--border-muted, var(--border))" }}>
                  <td style={{ padding: "4px 8px 4px 0", color: "var(--text-3)" }}>Q{q.questionIndex + 1}</td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{q.wpm}</td>
                  <td style={{ padding: "4px 8px 4px 0", color: q.fillerWordTotal > 3 ? "#f87171" : undefined }}>{q.fillerWordTotal}</td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{q.fillerWordRate}</td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{q.avgVolume}</td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{q.silencePeriods}</td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{fmtMs(q.totalSilenceMs)}</td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{fmtMs(q.speakingTimeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Per-question transcripts + filler breakdown */}
      {mic.perQuestion.filter(q => q.transcript).map(q => (
        <details key={q.questionIndex} style={{ marginTop: 6, fontSize: 11 }}>
          <summary style={{ cursor: "pointer", color: "var(--text-3)" }}>Q{q.questionIndex + 1} transcript & fillers</summary>
          <div style={{ marginTop: 4, padding: 8, background: "var(--surface2)", borderRadius: 6 }}>
            {q.transcript && <p style={{ color: "var(--text-2)", marginBottom: 4 }}>{q.transcript}</p>}
            {Object.entries(q.fillerWords).filter(([, v]) => v > 0).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {Object.entries(q.fillerWords).filter(([, v]) => v > 0).map(([word, count]) => (
                  <span key={word} style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", borderRadius: 4, padding: "1px 6px" }}>
                    {word}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function CameraSection({ cam }: { cam: import("@/hooks/useCameraAnalyzer").CameraPayload | null | undefined }) {
  if (!cam) return null;
  const totalFrames = cam.perQuestion.reduce((s, q) => s + q.framesSampled, 0);
  const totalAwayFrames = cam.perQuestion.reduce((s, q) => s + q.lookingAwayFrames, 0);
  const totalMultiFrames = cam.perQuestion.reduce((s, q) => s + q.multipleFacesFrames, 0);
  const awayPct = totalFrames > 0 ? Math.round((totalAwayFrames / totalFrames) * 100) : 0;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6 }}>CAMERA ANALYSIS</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <BPill label="Face Detector" value={cam.faceDetectorAvailable ? "Available" : "Unavailable"} />
        <BPill label="Frames Sampled" value={totalFrames} />
        <BPill label="Looking Away" value={`${awayPct}%`} danger={awayPct > 20} />
        <BPill label="Multiple Faces" value={totalMultiFrames} danger={totalMultiFrames > 0} />
      </div>
      {cam.perQuestion.length > 0 && cam.faceDetectorAvailable && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
                {["Q#","Frames","Avg Faces","Away Frames","Away %","Multi-Face Frames","Multi-Face %"].map(h => (
                  <th key={h} style={{ padding: "3px 8px 3px 0", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cam.perQuestion.map((q) => (
                <tr key={q.questionIndex} style={{ borderBottom: "1px solid var(--border-muted, var(--border))" }}>
                  <td style={{ padding: "4px 8px 4px 0", color: "var(--text-3)" }}>Q{q.questionIndex + 1}</td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{q.framesSampled}</td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{q.facesDetectedAvg}</td>
                  <td style={{ padding: "4px 8px 4px 0", color: q.lookingAwayPct > 20 ? "#f87171" : undefined }}>{q.lookingAwayFrames}</td>
                  <td style={{ padding: "4px 8px 4px 0", color: q.lookingAwayPct > 20 ? "#f87171" : undefined }}>{q.lookingAwayPct}%</td>
                  <td style={{ padding: "4px 8px 4px 0", color: q.multipleFacesPct > 0 ? "#f87171" : undefined }}>{q.multipleFacesFrames}</td>
                  <td style={{ padding: "4px 8px 4px 0", color: q.multipleFacesPct > 0 ? "#f87171" : undefined }}>{q.multipleFacesPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!cam.faceDetectorAvailable && (
        <p style={{ fontSize: 11, color: "var(--text-3)" }}>Face detection API not available in this browser — only frame count recorded.</p>
      )}
    </div>
  );
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
