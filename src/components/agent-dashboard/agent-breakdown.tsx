import { useMemo, useState } from "react";
import { fmt, summarizeAgents } from "./metrics";
import { agentColor, capsFor } from "./agent-registry";
import type { AgentEvent } from "./types";

/**
 * Per-agent rollup of calls / latency / tokens / cost / errors, plus the
 * capability chips that come straight out of the agent registry. Sorted
 * by total cost descending, with row-level expansion to surface the full
 * read / write / tool list (collapsed by default to keep density).
 */
export function AgentBreakdown({ events }: { events: AgentEvent[] }) {
  const rows = useMemo(() => summarizeAgents(events), [events]);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div
        className="mono flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.14em]"
        style={{ color: "var(--text-3)" }}
      >
        <span>Agents</span>
        <span>
          {rows.length} active · sorted by cost
        </span>
      </div>
      <div className="px-2 pb-2">
        {rows.map((row) => {
          const isOpen = expanded === row.agent;
          const color = agentColor(row.agent);
          const caps = capsFor(row.agent);
          return (
            <div key={row.agent} className="mb-1">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : row.agent)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                aria-expanded={isOpen}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span
                  className="mono w-[88px] shrink-0 truncate"
                  style={{ color, fontSize: "11px", fontWeight: 600 }}
                >
                  {row.agent}
                </span>
                <Stat label="calls" value={fmt.count(row.callCount)} />
                <Stat
                  label="avg"
                  value={row.callCount ? fmt.ms(row.avgLatencyMs) : "—"}
                />
                <Stat
                  label="tok"
                  value={fmt.tokens(row.totalInputTokens + row.totalOutputTokens)}
                />
                <Stat label="cost" value={fmt.usd(row.totalCostUsd)} />
                {row.errorCount > 0 && (
                  <span
                    className="mono ml-auto rounded-sm px-1.5 py-[1px] text-[9px] uppercase tracking-wide"
                    style={{
                      background: "rgba(248,113,113,0.18)",
                      color: "#fca5a5",
                    }}
                  >
                    {row.errorCount} err
                  </span>
                )}
                <span
                  className="mono shrink-0 text-[10px]"
                  style={{ color: "var(--text-3)", marginLeft: "auto" }}
                >
                  {isOpen ? "▾" : "▸"}
                </span>
              </button>

              {isOpen && (
                <div
                  className="ml-4 mt-1 mb-2 flex flex-wrap items-center gap-1 rounded-md border px-2 py-1.5"
                  style={{
                    borderColor: "var(--border)",
                    background: "rgba(0,0,0,0.3)",
                  }}
                >
                  <span
                    className="mono mr-1 text-[9px] uppercase tracking-wider"
                    style={{ color: "var(--text-3)" }}
                  >
                    capabilities
                  </span>
                  {caps.read.map((scope) => (
                    <CapChip key={`r-${scope}`} kind="r" label={scope} />
                  ))}
                  {caps.write.map((scope) => (
                    <CapChip key={`w-${scope}`} kind="w" label={scope} />
                  ))}
                  {caps.tools.map((tool) => (
                    <CapChip key={`t-${tool}`} kind="t" label={tool} />
                  ))}
                  {caps.read.length === 0 &&
                    caps.write.length === 0 &&
                    caps.tools.length === 0 && (
                      <span
                        className="mono text-[10px]"
                        style={{ color: "var(--text-3)" }}
                      >
                        none declared
                      </span>
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="mono shrink-0 text-[10px]"
      style={{ color: "var(--text-3)" }}
    >
      <span style={{ opacity: 0.6 }}>{label} </span>
      <span style={{ color: "var(--text-2)" }}>{value}</span>
    </span>
  );
}

function CapChip({
  kind,
  label,
}: {
  kind: "r" | "w" | "t";
  label: string;
}) {
  const styles = {
    r: { bg: "rgba(56,189,248,0.15)", fg: "#7dd3fc", prefix: "R" },
    w: { bg: "rgba(118,185,0,0.15)", fg: "var(--green)", prefix: "W" },
    t: { bg: "rgba(167,139,250,0.18)", fg: "#c4b5fd", prefix: "T" },
  }[kind];
  return (
    <span
      className="mono rounded-sm px-1.5 py-[1px] text-[9px]"
      style={{ background: styles.bg, color: styles.fg }}
    >
      <span style={{ opacity: 0.7, marginRight: 3 }}>{styles.prefix}</span>
      {label}
    </span>
  );
}
