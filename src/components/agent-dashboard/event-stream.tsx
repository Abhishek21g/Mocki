import { useEffect, useMemo, useRef, useState } from "react";
import { agentColor } from "./agent-registry";
import { fmt } from "./metrics";
import type { AgentEvent } from "./types";

const PHASE_LABELS: Record<string, { letter: string; bg: string; fg: string; label: string }> = {
  start: { letter: "S", bg: "rgba(59,130,246,0.18)", fg: "#93c5fd", label: "start" },
  end: { letter: "E", bg: "rgba(118,185,0,0.18)", fg: "var(--green)", label: "end" },
  info: { letter: "I", bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1", label: "info" },
  error: { letter: "!", bg: "rgba(248,113,113,0.20)", fg: "#fca5a5", label: "error" },
};
const ALL_PHASES = ["start", "end", "info", "error"] as const;

/**
 * Dense, table-layout event stream with chip filters, free-text search, click-to-expand
 * meta JSON, and an autoscroll pause toggle. Designed to feel like a live tracing console
 * rather than a card timeline — every column is fixed width except the message body so the
 * eye can scan latency / tokens at a glance.
 */
export function EventStream({
  events,
  variant,
}: {
  events: AgentEvent[];
  variant: "inline" | "drawer" | "standalone";
}) {
  const allAgents = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.agent);
    return [...set].sort();
  }, [events]);

  // Empty set = "include everything". Once the user clicks a chip we start filtering.
  const [selAgents, setSelAgents] = useState<Set<string>>(new Set());
  const [selPhases, setSelPhases] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [paused, setPaused] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (selAgents.size > 0 && !selAgents.has(e.agent)) return false;
      if (selPhases.size > 0 && !selPhases.has(e.phase)) return false;
      if (q) {
        const haystack = `${e.agent} ${e.message}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, selAgents, selPhases, search]);

  // Pending counter: while paused, count how many filtered events came in since the
  // user last hit "resume". Reset whenever pause toggles off.
  const baselineRef = useRef(filtered.length);
  const [pendingCount, setPendingCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) {
      const delta = Math.max(0, filtered.length - baselineRef.current);
      setPendingCount(delta);
    } else {
      baselineRef.current = filtered.length;
      setPendingCount(0);
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [filtered.length, paused]);

  const fontSizes = {
    inline: { row: 11, time: 9, chip: 9 },
    drawer: { row: 11, time: 9, chip: 9 },
    standalone: { row: 12, time: 10, chip: 10 },
  }[variant];

  const filterCount =
    selAgents.size + selPhases.size + (search.trim() ? 1 : 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div
        className="mono flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.14em]"
        style={{
          color: "var(--text-3)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2">
          <span>Event stream</span>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="mono cursor-pointer rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            style={{
              color: filterCount > 0 ? "var(--green)" : "var(--text-2)",
              borderColor: filterCount > 0 ? "var(--green)" : "var(--border)",
              background: "rgba(0,0,0,0.4)",
            }}
            aria-expanded={filtersOpen}
          >
            {filtersOpen ? "▾" : "▸"} filters
            {filterCount > 0 ? ` · ${filterCount}` : ""}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            className="mono cursor-pointer rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            style={{
              color: paused ? "#fbbf24" : "var(--text-2)",
              borderColor: paused ? "#fbbf24" : "var(--border)",
              background: "rgba(0,0,0,0.4)",
            }}
            title={paused ? "Resume autoscroll" : "Pause autoscroll"}
          >
            {paused ? "▶ resume" : "⏸ pause"}
          </button>
          <span className="mono shrink-0">
            {filtered.length}
            {filtered.length !== events.length && (
              <span style={{ opacity: 0.5 }}> / {events.length}</span>
            )}
          </span>
        </div>
      </div>

      {/* Filter bar */}
      {filtersOpen && (
        <FilterBar
          allAgents={allAgents}
          selAgents={selAgents}
          setSelAgents={setSelAgents}
          selPhases={selPhases}
          setSelPhases={setSelPhases}
          search={search}
          setSearch={setSearch}
        />
      )}

      {/* Column header */}
      <div
        className="mono flex items-center gap-2 px-3 py-1 text-[9px] uppercase tracking-wider"
        style={{
          color: "var(--text-3)",
          borderBottom: "1px solid var(--border)",
          background: "rgba(0,0,0,0.25)",
          opacity: 0.65,
        }}
      >
        <span className="w-[68px] shrink-0">time</span>
        <span className="w-[88px] shrink-0">agent</span>
        <span className="w-[18px] shrink-0 text-center">ph</span>
        <span className="flex-1 truncate">message</span>
        <span className="w-[44px] shrink-0 text-right">ms</span>
        <span className="w-[44px] shrink-0 text-right">tok</span>
      </div>

      {/* Stream rows */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto"
        style={{ fontSize: `${fontSizes.row}px` }}
      >
        {filtered.length === 0 && (
          <div
            className="mono p-3 text-xs"
            style={{ color: "var(--text-3)" }}
          >
            {events.length === 0
              ? "Waiting for agents..."
              : "No events match the current filters."}
          </div>
        )}
        {filtered.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            expanded={expandedId === event.id}
            onToggle={() =>
              setExpandedId((cur) => (cur === event.id ? null : event.id))
            }
            timeSize={fontSizes.time}
          />
        ))}

        {/* Pending-while-paused indicator */}
        {paused && pendingCount > 0 && (
          <button
            type="button"
            onClick={() => setPaused(false)}
            className="mono pointer-events-auto sticky bottom-2 left-1/2 z-10 -translate-x-1/2 cursor-pointer rounded-full px-3 py-1 text-[10px] uppercase tracking-wider shadow-lg transition-transform hover:scale-105"
            style={{
              background: "var(--green)",
              color: "#000",
              border: "1px solid rgba(0,0,0,0.4)",
              boxShadow: "0 0 12px var(--green-glow)",
              display: "block",
              margin: "0 auto",
            }}
          >
            ↓ {pendingCount} new event{pendingCount === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}

function FilterBar({
  allAgents,
  selAgents,
  setSelAgents,
  selPhases,
  setSelPhases,
  search,
  setSearch,
}: {
  allAgents: string[];
  selAgents: Set<string>;
  setSelAgents: (s: Set<string>) => void;
  selPhases: Set<string>;
  setSelPhases: (s: Set<string>) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  const toggle = (cur: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(cur);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  return (
    <div
      className="flex flex-col gap-2 px-3 py-2"
      style={{
        borderBottom: "1px solid var(--border)",
        background: "rgba(0,0,0,0.2)",
      }}
    >
      {/* Agent chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="mono w-[44px] shrink-0 text-[9px] uppercase tracking-wider"
          style={{ color: "var(--text-3)" }}
        >
          agent
        </span>
        {allAgents.length === 0 ? (
          <span
            className="mono text-[10px]"
            style={{ color: "var(--text-3)" }}
          >
            (none yet)
          </span>
        ) : (
          allAgents.map((agent) => {
            const active = selAgents.has(agent);
            const dim = selAgents.size > 0 && !active;
            const color = agentColor(agent);
            return (
              <button
                key={agent}
                type="button"
                onClick={() => toggle(selAgents, agent, setSelAgents)}
                className="mono inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px] transition-all"
                style={{
                  borderColor: active ? color : "var(--border)",
                  background: active ? `${withAlpha(color, 0.15)}` : "rgba(0,0,0,0.3)",
                  color: dim ? "var(--text-3)" : "var(--text-2)",
                  opacity: dim ? 0.5 : 1,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
                {agent}
              </button>
            );
          })
        )}
        {selAgents.size > 0 && (
          <button
            type="button"
            onClick={() => setSelAgents(new Set())}
            className="mono text-[9px] uppercase tracking-wider underline"
            style={{ color: "var(--text-3)" }}
          >
            clear
          </button>
        )}
      </div>

      {/* Phase chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="mono w-[44px] shrink-0 text-[9px] uppercase tracking-wider"
          style={{ color: "var(--text-3)" }}
        >
          phase
        </span>
        {ALL_PHASES.map((phase) => {
          const active = selPhases.has(phase);
          const dim = selPhases.size > 0 && !active;
          const meta = PHASE_LABELS[phase];
          return (
            <button
              key={phase}
              type="button"
              onClick={() => toggle(selPhases, phase, setSelPhases)}
              className="mono inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px] uppercase tracking-wider transition-all"
              style={{
                borderColor: active ? meta.fg : "var(--border)",
                background: active ? meta.bg : "rgba(0,0,0,0.3)",
                color: dim ? "var(--text-3)" : meta.fg,
                opacity: dim ? 0.5 : 1,
              }}
            >
              {meta.label}
            </button>
          );
        })}
        {selPhases.size > 0 && (
          <button
            type="button"
            onClick={() => setSelPhases(new Set())}
            className="mono text-[9px] uppercase tracking-wider underline"
            style={{ color: "var(--text-3)" }}
          >
            clear
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5">
        <span
          className="mono w-[44px] shrink-0 text-[9px] uppercase tracking-wider"
          style={{ color: "var(--text-3)" }}
        >
          search
        </span>
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter by agent or message…"
            className="mono w-full rounded border px-2 py-1 text-[10px] outline-none focus:border-[color:var(--green)]"
            style={{
              background: "rgba(0,0,0,0.4)",
              borderColor: "var(--border)",
              color: "var(--text-1)",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mono absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer rounded px-1 text-[10px]"
              style={{ color: "var(--text-3)" }}
              aria-label="clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
  timeSize,
}: {
  event: AgentEvent;
  expanded: boolean;
  onToggle: () => void;
  timeSize: number;
}) {
  const color = agentColor(event.agent);
  const phase = PHASE_LABELS[event.phase] ?? PHASE_LABELS.info;
  const isError = event.phase === "error";
  const isEnd = event.phase === "end";
  const totalTokens =
    isEnd && (event.inputTokens != null || event.outputTokens != null)
      ? (event.inputTokens ?? 0) + (event.outputTokens ?? 0)
      : null;

  // Filter out the metadata fields we already render in dedicated columns —
  // showing them again in the JSON dump would just be noise.
  const extraMeta = useMemo(() => {
    const omit = new Set([
      "id",
      "ts",
      "agent",
      "phase",
      "message",
      "turn",
      "corrId",
      "latencyMs",
      "inputTokens",
      "outputTokens",
      "costUsd",
      "model",
    ]);
    const rest: Record<string, any> = {};
    for (const [k, v] of Object.entries(event)) {
      if (!omit.has(k) && v !== undefined && v !== null) rest[k] = v;
    }
    if (event.meta && typeof event.meta === "object") {
      Object.assign(rest, event.meta);
    }
    return Object.keys(rest).length > 0 ? rest : null;
  }, [event]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex cursor-pointer items-center gap-2 px-3 py-1 transition-colors hover:bg-[rgba(255,255,255,0.03)]"
        style={{
          borderLeft: `2px solid ${color}`,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: expanded ? "rgba(255,255,255,0.04)" : undefined,
        }}
      >
        <span
          className="mono w-[68px] shrink-0"
          style={{ color: "var(--text-3)", fontSize: `${timeSize}px` }}
        >
          {formatTime(event.ts)}
        </span>
        <span className="flex w-[88px] shrink-0 items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span
            className="mono truncate"
            style={{ color, fontWeight: 600 }}
          >
            {event.agent}
          </span>
        </span>
        <span
          className="mono w-[18px] shrink-0 rounded-sm text-center text-[9px] font-bold"
          style={{
            background: phase.bg,
            color: phase.fg,
            padding: "1px 0",
          }}
          title={phase.label}
        >
          {phase.letter}
        </span>
        <span
          className="flex-1 truncate"
          style={{ color: isError ? "#fca5a5" : "var(--text-2)" }}
          title={event.message}
        >
          {event.message}
        </span>
        <span
          className="mono w-[44px] shrink-0 text-right"
          style={{ color: "var(--text-3)" }}
        >
          {event.latencyMs != null ? fmt.ms(event.latencyMs) : ""}
        </span>
        <span
          className="mono w-[44px] shrink-0 text-right"
          style={{ color: "var(--text-3)" }}
        >
          {totalTokens != null ? fmt.tokens(totalTokens) : ""}
        </span>
      </div>

      {/* Expanded sub-row with full metadata */}
      {expanded && (
        <div
          className="px-3 py-2"
          style={{
            background: "rgba(0,0,0,0.45)",
            borderLeft: `2px solid ${color}`,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {event.turn != null && <MetaRow label="turn" value={String(event.turn)} />}
            {event.corrId && (
              <MetaRow label="corrId" value={event.corrId} mono mono16 />
            )}
            {event.model && <MetaRow label="model" value={event.model} mono />}
            {event.latencyMs != null && (
              <MetaRow label="latencyMs" value={fmt.ms(event.latencyMs)} />
            )}
            {event.inputTokens != null && (
              <MetaRow label="input tok" value={fmt.tokens(event.inputTokens)} />
            )}
            {event.outputTokens != null && (
              <MetaRow label="output tok" value={fmt.tokens(event.outputTokens)} />
            )}
            {event.costUsd != null && (
              <MetaRow label="cost" value={fmt.usd(event.costUsd)} />
            )}
            <MetaRow label="event id" value={event.id} mono mono16 />
            <MetaRow label="ts" value={new Date(event.ts).toISOString()} mono />
          </div>
          {extraMeta && (
            <details className="mt-2">
              <summary
                className="mono cursor-pointer text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                extra metadata
              </summary>
              <pre
                className="mono mt-1 max-h-48 overflow-auto rounded p-2 text-[10px]"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  color: "var(--text-2)",
                  border: "1px solid var(--border)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(extraMeta, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
  mono16 = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  mono16?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className="mono text-[9px] uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
      <span
        className={mono ? "mono" : ""}
        style={{
          color: "var(--text-2)",
          fontSize: mono16 ? "10px" : "11px",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(
    d.getMilliseconds(),
  )}`;
}
function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function pad3(n: number) {
  if (n < 10) return `00${n}`;
  if (n < 100) return `0${n}`;
  return String(n);
}

function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) return hex;
  let r = 0,
    g = 0,
    b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
