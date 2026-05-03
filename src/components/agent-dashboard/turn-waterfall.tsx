import { useEffect, useMemo, useRef, useState } from "react";
import { agentColor } from "./agent-registry";
import { fmt, groupByTurn } from "./metrics";
import type { AgentEvent, AgentSpan, TurnGroup } from "./types";

/**
 * Per-turn timing waterfall. One row per Nemotron call, x-axis scaled to
 * the active turn's wall duration so parallelism (Evaluator || Memory) is
 * visually obvious. Auto-tracks the live turn unless the user picks a
 * specific one from the dropdown.
 */
export function TurnWaterfall({ events }: { events: AgentEvent[] }) {
  const turns = useMemo(() => groupByTurn(events), [events]);
  const turnsWithSpans = useMemo(() => turns.filter((t) => t.spans.length > 0), [turns]);

  const liveTurn = turnsWithSpans.length
    ? turnsWithSpans[turnsWithSpans.length - 1].turn
    : 0;

  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);
  const followLiveRef = useRef(true);

  // Auto-advance the selection when a new turn appears, unless the user has
  // explicitly picked an older turn (followLiveRef = false).
  useEffect(() => {
    if (followLiveRef.current) {
      setSelectedTurn(liveTurn);
    }
  }, [liveTurn]);

  const activeTurnIndex = selectedTurn ?? liveTurn;
  const activeTurn = turnsWithSpans.find((t) => t.turn === activeTurnIndex);

  if (turnsWithSpans.length === 0) {
    return (
      <EmptyState message="No Nemotron calls yet — agents fire as the interview begins." />
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-3 pt-3 pb-1"
        style={{ gap: 8 }}
      >
        <div className="flex items-center gap-2">
          <span
            className="mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: "var(--text-3)" }}
          >
            Turn waterfall
          </span>
          <select
            value={activeTurnIndex}
            onChange={(e) => {
              const next = Number(e.target.value);
              setSelectedTurn(next);
              // If the user picks the live turn explicitly, keep following.
              followLiveRef.current = next === liveTurn;
            }}
            className="mono cursor-pointer rounded border px-1.5 py-0.5 text-[10px]"
            style={{
              background: "rgba(0,0,0,0.5)",
              borderColor: "var(--border)",
              color: "var(--text-2)",
            }}
          >
            {turnsWithSpans.map((t) => (
              <option key={t.turn} value={t.turn}>
                {t.turn === 0 ? "Turn 0 · setup" : `Turn ${t.turn}`}
                {t.turn === liveTurn ? " · live" : ""}
              </option>
            ))}
          </select>
        </div>
        {activeTurn && (
          <div
            className="mono flex items-center gap-2 text-[10px]"
            style={{ color: "var(--text-3)" }}
          >
            <span>{fmt.ms(activeTurn.endTs - activeTurn.startTs)} wall</span>
            <span>·</span>
            <span>{fmt.tokens(activeTurn.totalTokens)} tok</span>
            <span>·</span>
            <span>{fmt.usd(activeTurn.totalCostUsd)}</span>
          </div>
        )}
      </div>

      {activeTurn && <WaterfallRows turn={activeTurn} />}
    </div>
  );
}

function WaterfallRows({ turn }: { turn: TurnGroup }) {
  const turnStart = turn.startTs;
  const turnEnd = turn.endTs;
  const turnDur = Math.max(turnEnd - turnStart, 1);

  // Live "now" cursor for in-flight spans. Initialized to null so SSR and the
  // first client paint agree; once mounted, only ticks while at least one
  // span is still running, then resets to avoid a runaway interval.
  const hasRunning = useMemo(
    () => turn.spans.some((s) => s.status === "running"),
    [turn.spans],
  );
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!hasRunning) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [hasRunning]);

  const rows = useMemo(() => {
    const sorted = [...turn.spans].sort((a, b) => a.startTs - b.startTs);
    return sorted.map((span) => ({
      span,
      leftPct: ((span.startTs - turnStart) / turnDur) * 100,
      widthPct:
        span.endTs != null
          ? Math.max(((span.endTs - span.startTs) / turnDur) * 100, 0.5)
          : now != null
            ? Math.max(((now - span.startTs) / turnDur) * 100, 1.5)
            : 1.5,
    }));
  }, [turn.spans, turnStart, turnDur, now]);

  return (
    <div className="px-3 pt-1 pb-2">
      <div className="space-y-1">
        {rows.map(({ span, leftPct, widthPct }) => (
          <WaterfallRow
            key={span.corrId}
            span={span}
            leftPct={leftPct}
            widthPct={widthPct}
          />
        ))}
      </div>
      <TimeAxis totalMs={turnDur} />
    </div>
  );
}

function WaterfallRow({
  span,
  leftPct,
  widthPct,
}: {
  span: AgentSpan;
  leftPct: number;
  widthPct: number;
}) {
  const color = agentColor(span.agent);
  const isRunning = span.status === "running";
  const isError = span.status === "error";

  const tooltip = [
    `${span.agent}${span.model ? ` · ${span.model}` : ""}`,
    span.latencyMs != null ? `${fmt.ms(span.latencyMs)}` : "running…",
    span.inputTokens != null && span.outputTokens != null
      ? `${fmt.tokens((span.inputTokens ?? 0) + (span.outputTokens ?? 0))} tok (${fmt.tokens(
          span.inputTokens ?? 0,
        )} in · ${fmt.tokens(span.outputTokens ?? 0)} out)`
      : "",
    span.costUsd != null && span.costUsd > 0 ? fmt.usd(span.costUsd) : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex items-center gap-2 text-[10px]" title={tooltip}>
      {/* Agent label */}
      <div className="flex w-[78px] shrink-0 items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span
          className="mono truncate"
          style={{ color: "var(--text-2)", fontSize: "10px" }}
        >
          {span.agent}
        </span>
      </div>

      {/* Bar track */}
      <div
        className="relative h-3.5 flex-1 rounded-sm"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <div
          className={
            isRunning
              ? "absolute h-full rounded-sm"
              : "absolute h-full rounded-sm transition-all"
          }
          style={{
            left: `${Math.min(Math.max(leftPct, 0), 100)}%`,
            width: `${Math.min(Math.max(widthPct, 0.5), 100 - leftPct)}%`,
            background: isError
              ? "linear-gradient(90deg, #ef4444 0%, #f87171 100%)"
              : isRunning
                ? `repeating-linear-gradient(135deg, ${color}, ${color} 4px, ${withAlpha(
                    color,
                    0.45,
                  )} 4px, ${withAlpha(color, 0.45)} 8px)`
                : `linear-gradient(90deg, ${color} 0%, ${withAlpha(color, 0.85)} 100%)`,
            opacity: isRunning ? 0.9 : 1,
            boxShadow: isRunning ? `0 0 8px ${withAlpha(color, 0.5)}` : "none",
            animation: isRunning ? "pulse-soft 1.4s ease-in-out infinite" : undefined,
          }}
        />
      </div>

      {/* Right-side latency / status */}
      <div
        className="mono w-[58px] shrink-0 text-right"
        style={{ color: isError ? "#fca5a5" : "var(--text-3)", fontSize: "10px" }}
      >
        {isRunning
          ? "running…"
          : span.latencyMs != null
            ? fmt.ms(span.latencyMs)
            : "—"}
      </div>
    </div>
  );
}

function TimeAxis({ totalMs }: { totalMs: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div
      className="mono mt-1 flex items-center gap-2 text-[9px]"
      style={{ color: "var(--text-3)" }}
    >
      <span className="w-[78px] shrink-0" />
      <div className="relative h-3 flex-1">
        <div
          className="absolute inset-x-0 top-1 h-px"
          style={{ background: "rgba(255,255,255,0.08)" }}
        />
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 flex flex-col items-center"
            style={{
              left: `${t * 100}%`,
              transform: t === 0 ? "translateX(0)" : t === 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            <div
              className="h-2 w-px"
              style={{ background: "rgba(255,255,255,0.18)" }}
            />
            <span className="mt-0.5">{fmt.ms(totalMs * t)}</span>
          </div>
        ))}
      </div>
      <span className="w-[58px] shrink-0" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="mono px-3 py-3 text-[10px]"
      style={{
        color: "var(--text-3)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {message}
    </div>
  );
}

/**
 * Adds an alpha component to a hex color string. Tolerant of `#rgb`,
 * `#rrggbb`, and falls back to the original on anything else (e.g. CSS
 * variable references).
 */
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
