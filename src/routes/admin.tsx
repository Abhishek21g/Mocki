import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { getHireBg, getHireColor, scoreToColor } from "@/lib/ghost-utils";
import {
  fetchAdminStats,
  fetchAdminRecordingUrl,
  type AdminSession,
  type AdminStats,
  type AdminUser,
  type ScoreDistributionBucket,
} from "@/server/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin · Mocki" }],
  }),
  component: AdminPage,
});

const ADMIN_EMAIL = "enaguthiabhishek@gmail.com";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AdminPage() {
  const { status, user, getAccessToken } = useSupabaseAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

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
    if (!user || user.email !== ADMIN_EMAIL) return;
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

  if (status === "ready" && (!user || user.email !== ADMIN_EMAIL)) {
    return <Navigate to="/" />;
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

            {/* ── All Sessions ──────────────────────────────────── */}
            <section className="fade-up mt-8">
              <SectionLabel>All Sessions ({stats.sessions.length})</SectionLabel>
              <div className="gp-card overflow-hidden p-0">
                <AllSessionsTable sessions={stats.sessions} accessToken={getAccessToken() ?? ""} />
              </div>
            </section>

            {/* ── All Users ─────────────────────────────────────── */}
            <section className="fade-up mt-8">
              <SectionLabel>All Users ({stats.users.length})</SectionLabel>
              <div className="gp-card overflow-hidden p-0">
                <AllUsersTable users={stats.users} sessions={stats.sessions} />
              </div>
            </section>
          </>
        )}
      </main>
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
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingChecked, setRecordingChecked] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    setHeight(open ? ref.current.scrollHeight : 0);
  }, [open, s.rounds.length, recordingUrl]);

  useEffect(() => {
    if (!open || recordingChecked) return;
    setRecordingChecked(true);
    setRecordingLoading(true);
    fetchAdminRecordingUrl({ data: { accessToken, userId: s.userId, sessionId: s.id } })
      .then((res) => { setRecordingUrl(res.url ?? null); })
      .catch(() => {})
      .finally(() => setRecordingLoading(false));
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
          ) : recordingUrl ? (
            <video
              src={recordingUrl}
              controls
              style={{ width: "100%", maxHeight: 280, borderRadius: 10, background: "#000", display: "block" }}
            />
          ) : (
            <div style={{ height: 44, display: "flex", alignItems: "center", fontSize: 12, color: "var(--text-3)", background: "var(--surface3)", borderRadius: 8, paddingLeft: 12, border: "1px dashed var(--border)" }}>
              No recording for this session
            </div>
          )}
        </div>

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
