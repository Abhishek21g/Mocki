import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { showToast } from "@/components/ghost/Toaster";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { store } from "@/lib/ghost-store";
import { useSupabaseAuth } from "@/lib/supabase-context";
import {
  clearLearnerMemory,
  deleteInterviewSession,
  fetchInterviewHistory,
  fetchLearnerMemory,
  type HistoryListItem,
} from "@/server/history.functions";
import { getSessionRecordingUrl } from "@/server/upload.functions";
import type { LearnerMemory } from "@/server/history.server";
import { getHireBg, getHireColor, scoreToColor } from "@/lib/ghost-utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [{ title: "Dashboard · Mocki" }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { status, user, signInWithGoogle, getAccessToken } = useSupabaseAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryListItem[] | null>(null);
  const [memory, setMemory] = useState<LearnerMemory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<HistoryListItem | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const accessToken = getAccessToken();
    if (!accessToken) { setItems([]); setMemory(null); return; }
    try {
      const [history, mem] = await Promise.all([
        fetchInterviewHistory({ data: { accessToken } }),
        fetchLearnerMemory({ data: { accessToken } }),
      ]);
      if (!history.ok) { setItems([]); setError("Sign in again to view your history."); return; }
      setItems(history.items);
      setMemory(mem.ok ? mem.memory : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
      setItems([]);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!user) { setItems([]); setMemory(null); return; }
    refresh();
  }, [status, user, refresh]);

  async function openModal(item: HistoryListItem) {
    setSelectedItem(item);
    setRecordingUrl(null);
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoadingRecording(true);
    try {
      const res = await getSessionRecordingUrl({ data: { accessToken, sessionId: item.id } });
      setRecordingUrl(res.url ?? null);
    } catch {
      // no recording is fine
    } finally {
      setLoadingRecording(false);
    }
  }

  async function openFullReport(item: HistoryListItem) {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoadingReport(true);
    try {
      const { fetchInterviewSession } = await import("@/server/history.functions");
      const res = await fetchInterviewSession({ data: { accessToken, sessionId: item.id } });
      if (!res.ok || !res.payload) { showToast("Could not load that interview"); return; }
      store.set({ report: res.payload });
      navigate({ to: "/report" });
    } finally {
      setLoadingReport(false);
    }
  }

  async function deleteSession(item: HistoryListItem) {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    if (!window.confirm(`Delete this interview (${item.role || "Untitled"} @ ${item.company || "—"})? This cannot be undone.`)) return;
    setDeletingId(item.id);
    try {
      const res = await deleteInterviewSession({ data: { accessToken, sessionId: item.id } });
      if (!res.ok) { showToast("Could not delete that interview"); return; }
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
      if (selectedItem?.id === item.id) setSelectedItem(null);
      showToast("Interview deleted");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearMemory() {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    if (!window.confirm("Clear learner memory? Future interviews will start fresh. Past sessions stay saved.")) return;
    setClearingMemory(true);
    try {
      const res = await clearLearnerMemory({ data: { accessToken } });
      if (!res.ok) { showToast("Could not clear memory"); return; }
      setMemory({ weakTopics: [], strongTopics: [], lastSummary: null, lastRoles: [], totalSessions: 0, updatedAt: null });
      showToast("Learner memory cleared");
    } finally {
      setClearingMemory(false);
    }
  }

  if (status === "loading") return <Centered><span className="gp-spinner" /></Centered>;

  if (status === "unconfigured") return (
    <Centered>
      <div className="gp-card max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Supabase not configured</h1>
      </div>
    </Centered>
  );

  if (!user) return (
    <Centered>
      <div className="gp-card max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Sign in to view your dashboard</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>Sessions are scoped to your Google account.</p>
        <button type="button" className="gp-btn mt-6 w-full" onClick={() => signInWithGoogle().catch(() => showToast("Sign-in failed"))}>
          Sign in with Google
        </button>
        <Link to="/" className="mt-4 inline-block text-xs underline" style={{ color: "var(--text-3)" }}>Back home</Link>
      </div>
    </Centered>
  );

  const stats = computeStats(items ?? []);

  return (
    <div className="grid-bg min-h-screen pb-24">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-6 pr-[260px]">
        <HomeLogo className="text-base" />
        <div className="flex items-center gap-3">
          <Link to="/" className="gp-btn gp-btn-outline px-4 py-2 text-xs">New Interview</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-8">
        {/* Page title */}
        <div className="flex items-end justify-between">
          <div>
            <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Dashboard</div>
            <h1 className="mt-1 text-2xl font-bold">{user.email?.split("@")[0] ?? "Your"}'s Interviews</h1>
          </div>
          <button type="button" onClick={refresh} className="gp-btn gp-btn-outline px-3 py-1.5 text-xs">Refresh</button>
        </div>

        {/* Stats row */}
        {items && items.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Sessions" value={stats.total} />
            <StatCard label="Avg Score" value={stats.avgScore !== null ? stats.avgScore.toFixed(1) : "—"} color={stats.avgScore !== null ? scoreToColor(stats.avgScore) : undefined} />
            <StatCard label="Hire Rate" value={stats.hireRate !== null ? `${stats.hireRate}%` : "—"} color={stats.hireRate !== null && stats.hireRate >= 50 ? "#86efac" : "#fca5a5"} />
            <StatCard label="Best Score" value={stats.best !== null ? stats.best.toFixed(1) : "—"} color={stats.best !== null ? scoreToColor(stats.best) : undefined} />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border px-4 py-3 text-sm" style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Learner memory */}
        {memory && memory.totalSessions > 0 && (
          <div className="mt-6">
            <MemoryCard memory={memory} onClear={handleClearMemory} clearing={clearingMemory} />
          </div>
        )}

        {/* Session grid */}
        <div className="mt-8">
          <div className="mono mb-4 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            Past Interviews
          </div>

          {items === null ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
              <span className="gp-spinner" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="gp-card p-8 text-center">
              <p className="text-sm" style={{ color: "var(--text-2)" }}>No interviews yet. <Link to="/" className="underline" style={{ color: "var(--green)" }}>Start one →</Link></p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <SessionCard
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  deleting={deletingId === item.id}
                  onClick={() => openModal(item)}
                  onDelete={() => deleteSession(item)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Detail modal */}
      {selectedItem && (
        <SessionModal
          item={selectedItem}
          recordingUrl={recordingUrl}
          loadingRecording={loadingRecording}
          loadingReport={loadingReport}
          onClose={() => setSelectedItem(null)}
          onOpenReport={() => openFullReport(selectedItem)}
          onDelete={() => deleteSession(selectedItem)}
          deleting={deletingId === selectedItem.id}
        />
      )}
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="gp-card p-4">
      <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="mt-1.5 text-2xl font-bold" style={{ color: color ?? "var(--text-1)" }}>{value}</div>
    </div>
  );
}

// ── Session card ───────────────────────────────────────────────────────────────
function SessionCard({ item, selected, deleting, onClick, onDelete }: {
  item: HistoryListItem;
  selected: boolean;
  deleting: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const dateLabel = useMemo(() => {
    try { return new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch { return item.createdAt; }
  }, [item.createdAt]);

  return (
    <div
      className={`gp-card cursor-pointer p-5 transition-all hover:border-white/30 ${deleting ? "opacity-40" : ""}`}
      style={{ borderColor: selected ? "rgba(118,185,0,0.5)" : undefined, background: selected ? "rgba(118,185,0,0.04)" : undefined }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {item.role || "Untitled"} <span style={{ color: "var(--text-3)" }}>@</span> {item.company || "—"}
          </div>
          <div className="mono mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
            {dateLabel}{item.interviewType ? ` · ${item.interviewType}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {typeof item.overallScore === "number" && (
            <span className="mono rounded px-2 py-0.5 text-sm font-bold" style={{ color: scoreToColor(item.overallScore), background: `${scoreToColor(item.overallScore)}1a` }}>
              {item.overallScore.toFixed(1)}
            </span>
          )}
          {item.hireDecision && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: getHireBg(item.hireDecision), color: getHireColor(item.hireDecision), border: `1px solid ${getHireColor(item.hireDecision)}` }}>
              {item.hireDecision}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RecordingDot />
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>Click to review</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-[11px] opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-3)" }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function RecordingDot() {
  return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />;
}

// ── Session modal ──────────────────────────────────────────────────────────────
function SessionModal({ item, recordingUrl, loadingRecording, loadingReport, onClose, onOpenReport, onDelete, deleting }: {
  item: HistoryListItem;
  recordingUrl: string | null;
  loadingRecording: boolean;
  loadingReport: boolean;
  onClose: () => void;
  onOpenReport: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const dateLabel = useMemo(() => {
    try { return new Date(item.createdAt).toLocaleString(); }
    catch { return item.createdAt; }
  }, [item.createdAt]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", zIndex: 200 }}
      />
      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          width: "min(680px, 95vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 0,
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>
              {item.role || "Untitled"} <span style={{ color: "var(--text-3)" }}>@</span> {item.company || "—"}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
              {dateLabel}{item.interviewType ? ` · ${item.interviewType}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {typeof item.overallScore === "number" && (
              <span className="mono" style={{ fontWeight: 700, fontSize: 18, color: scoreToColor(item.overallScore) }}>
                {item.overallScore.toFixed(1)}
              </span>
            )}
            {item.hireDecision && (
              <span style={{ borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", background: getHireBg(item.hireDecision), color: getHireColor(item.hireDecision), border: `1px solid ${getHireColor(item.hireDecision)}` }}>
                {item.hireDecision}
              </span>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 20, lineHeight: 1, padding: "2px 4px" }}>×</button>
          </div>
        </div>

        {/* Recording */}
        <div style={{ padding: "20px 24px" }}>
          <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", marginBottom: 10 }}>Recording</div>

          {loadingRecording ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 48, color: "var(--text-2)", fontSize: 13 }}>
              <span className="gp-spinner" /> Loading recording…
            </div>
          ) : recordingUrl ? (
            <video
              ref={videoRef}
              src={recordingUrl}
              controls
              style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 320, display: "block" }}
            />
          ) : (
            <div style={{ background: "var(--surface3)", borderRadius: 10, height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13, border: "1px dashed var(--border)" }}>
              No recording for this session
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: "0 24px 24px", display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onOpenReport}
            disabled={loadingReport}
            className="gp-btn flex-1"
            style={{ justifyContent: "center" }}
          >
            {loadingReport ? "Loading…" : "View Full Report →"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.07)", color: "#fca5a5", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Learner memory card ────────────────────────────────────────────────────────
function MemoryCard({ memory, onClear, clearing }: { memory: LearnerMemory | null; onClear: () => void; clearing: boolean }) {
  if (!memory || memory.totalSessions === 0) return null;

  return (
    <section className="gp-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          Learner Memory · <span style={{ color: "var(--green)" }}>{memory.totalSessions} session{memory.totalSessions !== 1 ? "s" : ""} indexed</span>
        </div>
        <button type="button" onClick={onClear} disabled={clearing} className="rounded-md border border-white/10 px-2 py-1 text-[11px] transition hover:border-white/30 disabled:opacity-50" style={{ color: "var(--text-3)" }}>
          {clearing ? "Clearing…" : "Clear memory"}
        </button>
      </div>
      {memory.lastSummary && (
        <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>{memory.lastSummary}</p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Pillars title="Recurring Weak Areas" tone="weak" items={memory.weakTopics} />
        <Pillars title="Demonstrated Strengths" tone="strong" items={memory.strongTopics} />
      </div>
    </section>
  );
}

function Pillars({ title, items, tone }: { title: string; items: string[]; tone: "weak" | "strong" }) {
  const color = tone === "weak" ? "#fca5a5" : "#86efac";
  return (
    <div>
      <div className="text-xs font-semibold" style={{ color }}>{title}</div>
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

// ── Helpers ────────────────────────────────────────────────────────────────────
function computeStats(items: HistoryListItem[]) {
  if (!items.length) return { total: 0, avgScore: null, hireRate: null, best: null };
  const scored = items.filter((i) => typeof i.overallScore === "number");
  const avgScore = scored.length ? scored.reduce((s, i) => s + i.overallScore!, 0) / scored.length : null;
  const best = scored.length ? Math.max(...scored.map((i) => i.overallScore!)) : null;
  const hireDecisions = items.filter((i) => i.hireDecision);
  const hired = hireDecisions.filter((i) => i.hireDecision?.toLowerCase().includes("hire") && !i.hireDecision?.toLowerCase().includes("no")).length;
  const hireRate = hireDecisions.length ? Math.round((hired / hireDecisions.length) * 100) : null;
  return { total: items.length, avgScore, hireRate, best };
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid-bg flex min-h-screen items-center justify-center px-6">{children}</div>;
}
