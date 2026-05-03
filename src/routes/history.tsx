import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { showToast } from "@/components/ghost/Toaster";
import { store } from "@/lib/ghost-store";
import { useSupabaseAuth } from "@/lib/supabase-context";
import {
  fetchInterviewHistory,
  fetchInterviewSession,
  fetchLearnerMemory,
  type HistoryListItem,
} from "@/server/history.functions";
import type { LearnerMemory } from "@/server/history.server";
import { getHireBg, getHireColor, scoreToColor } from "@/lib/ghost-utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [{ title: "History · Mockpilot" }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { status, user, signInWithGoogle, getAccessToken } = useSupabaseAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryListItem[] | null>(null);
  const [memory, setMemory] = useState<LearnerMemory | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const accessToken = getAccessToken();
    if (!accessToken) {
      setItems([]);
      setMemory(null);
      return;
    }
    try {
      const [history, mem] = await Promise.all([
        fetchInterviewHistory({ data: { accessToken } }),
        fetchLearnerMemory({ data: { accessToken } }),
      ]);
      if (!history.ok) {
        setItems([]);
        setError("Sign in again to view your history.");
        return;
      }
      setItems(history.items);
      setMemory(mem.ok ? mem.memory : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
      setItems([]);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!user) {
      setItems([]);
      setMemory(null);
      return;
    }
    refresh();
  }, [status, user, refresh]);

  async function openSession(item: HistoryListItem) {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoadingId(item.id);
    try {
      const res = await fetchInterviewSession({
        data: { accessToken, sessionId: item.id },
      });
      if (!res.ok || !res.payload) {
        showToast("Could not load that interview");
        return;
      }
      store.set({ report: res.payload });
      navigate({ to: "/report" });
    } finally {
      setLoadingId(null);
    }
  }

  if (status === "loading") {
    return (
      <Centered>
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
          <span className="gp-spinner" /> Loading history…
        </div>
      </Centered>
    );
  }

  if (status === "unconfigured") {
    return (
      <Centered>
        <div className="gp-card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Supabase not configured</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
            Set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in
            <code> .dev.vars</code> to enable history. See <code>supabase/README.md</code>.
          </p>
        </div>
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <div className="gp-card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Sign in to view your history</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
            Sessions and learner memory are scoped to your Google account.
          </p>
          <button
            type="button"
            className="gp-btn mt-6 w-full"
            onClick={() => {
              signInWithGoogle().catch((err) => {
                showToast(err instanceof Error ? err.message : "Sign-in failed");
              });
            }}
          >
            Sign in with Google
          </button>
          <Link
            to="/"
            className="mt-4 inline-block text-xs underline"
            style={{ color: "var(--text-3)" }}
          >
            Back home
          </Link>
        </div>
      </Centered>
    );
  }

  return (
    <div className="grid-bg min-h-screen pb-24">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8">
        <HomeLogo className="text-base" />
        <div className="mono text-xs" style={{ color: "var(--text-3)" }}>
          INTERVIEW HISTORY
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-12">
        <MemoryCard memory={memory} />

        <div className="mt-10 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">Past Interviews</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
              Click a session to reopen its debrief and round-by-round breakdown.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="gp-btn gp-btn-outline px-4 py-2 text-xs"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div
            className="mt-4 rounded-md border px-4 py-3 text-sm"
            style={{
              borderColor: "rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.1)",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        {items === null ? (
          <div className="mt-6 flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <span className="gp-spinner" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div
            className="mt-6 rounded-md border border-dashed px-6 py-12 text-center text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
          >
            No saved interviews yet. Run one from{" "}
            <Link to="/" className="underline" style={{ color: "var(--text-2)" }}>
              the home page
            </Link>{" "}
            to start building your history.
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <HistoryRow
                  item={item}
                  loading={loadingId === item.id}
                  onClick={() => openSession(item)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function HistoryRow({
  item,
  loading,
  onClick,
}: {
  item: HistoryListItem;
  loading: boolean;
  onClick: () => void;
}) {
  const dateLabel = useMemo(() => {
    try {
      return new Date(item.createdAt).toLocaleString();
    } catch {
      return item.createdAt;
    }
  }, [item.createdAt]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="gp-card w-full p-5 text-left transition hover:border-white/30 disabled:opacity-60"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-base font-semibold">
            {item.role || "Untitled role"} <span style={{ color: "var(--text-3)" }}>@</span>{" "}
            {item.company || "—"}
          </div>
          <div className="mono mt-1 text-[11px] uppercase" style={{ color: "var(--text-3)" }}>
            {dateLabel}
            {item.interviewType ? ` · ${item.interviewType}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {typeof item.overallScore === "number" && (
            <span
              className="mono rounded px-2 py-0.5 text-sm font-bold"
              style={{
                color: scoreToColor(item.overallScore),
                background: `${scoreToColor(item.overallScore)}1a`,
              }}
            >
              {item.overallScore.toFixed(1)}
            </span>
          )}
          {item.hireDecision && (
            <span
              className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{
                background: getHireBg(item.hireDecision),
                color: getHireColor(item.hireDecision),
                border: `1px solid ${getHireColor(item.hireDecision)}`,
              }}
            >
              {item.hireDecision}
            </span>
          )}
          <span style={{ color: "var(--text-3)" }}>{loading ? "…" : "→"}</span>
        </div>
      </div>
    </button>
  );
}

function MemoryCard({ memory }: { memory: LearnerMemory | null }) {
  if (!memory || memory.totalSessions === 0) {
    return (
      <section className="gp-card p-6">
        <div
          className="mono text-[11px] uppercase tracking-wider"
          style={{ color: "var(--text-3)" }}
        >
          Learner Memory
        </div>
        <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
          No memory yet — the next completed interview will start training your panel.
        </p>
      </section>
    );
  }

  return (
    <section className="gp-card p-6">
      <div className="flex items-center justify-between">
        <div
          className="mono text-[11px] uppercase tracking-wider"
          style={{ color: "var(--text-3)" }}
        >
          Learner Memory
        </div>
        <div className="mono text-[11px]" style={{ color: "var(--green)" }}>
          {memory.totalSessions} session{memory.totalSessions === 1 ? "" : "s"} indexed
        </div>
      </div>
      {memory.lastSummary && (
        <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
          {memory.lastSummary}
        </p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Pillars title="Recurring Weak Areas" tone="weak" items={memory.weakTopics} />
        <Pillars title="Demonstrated Strengths" tone="strong" items={memory.strongTopics} />
      </div>
      {memory.lastRoles.length > 0 && (
        <div className="mt-4 text-xs" style={{ color: "var(--text-3)" }}>
          Recent target roles: {memory.lastRoles.join(" · ")}
        </div>
      )}
    </section>
  );
}

function Pillars({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "weak" | "strong";
}) {
  const color = tone === "weak" ? "#fca5a5" : "#86efac";
  return (
    <div>
      <div className="text-xs font-semibold" style={{ color }}>
        {title}
      </div>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm" style={{ color: "var(--text-2)" }}>
        {items.length === 0 && <li style={{ color: "var(--text-3)" }}>—</li>}
        {items.slice(0, 6).map((item) => (
          <li key={item} className="flex gap-2">
            <span style={{ color }}>{tone === "weak" ? "✗" : "✓"}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid-bg flex min-h-screen items-center justify-center px-6">{children}</div>
  );
}
