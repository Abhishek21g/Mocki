import { cn } from "@/lib/utils";
import { AgentDashboard } from "@/components/agent-dashboard";
import type { AgentEvent } from "@/components/agent-dashboard/types";

export function FloatingAgentToggle({
  eventsCount,
  open,
  onToggle,
}: {
  eventsCount: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="fixed bottom-4 right-4 z-40 rounded-full border px-4 py-2 text-sm font-semibold"
      style={{
        background: "rgba(8,8,8,0.92)",
        borderColor: "var(--border)",
        color: "var(--green)",
        backdropFilter: "blur(12px)",
      }}
    >
      {open ? "Hide" : "Show"} agents · {eventsCount}
    </button>
  );
}

export function AgentPanel({
  events,
  mode,
  open,
  totalTurns,
  sessionId,
  onClose,
}: {
  events: AgentEvent[];
  mode: "inline" | "drawer";
  open: boolean;
  totalTurns: number;
  sessionId: string | null;
  onClose?: () => void;
}) {
  if (!open) return null;

  // Encoded popout link. Threading totalTurns through the search params
  // means a fresh tab still shows "Turn n / 6" instead of "Turn n / 1".
  const popoutHref = sessionId
    ? `/agents/${encodeURIComponent(sessionId)}?totalTurns=${totalTurns}`
    : null;

  return (
    <aside
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border",
        mode === "inline"
          ? "gp-card min-h-[720px]"
          : "fixed inset-x-4 bottom-20 top-24 z-40 bg-[rgba(8,8,8,0.96)] shadow-2xl",
      )}
      style={{
        borderColor: "var(--border)",
        background: mode === "inline" ? "var(--surface)" : "rgba(8,8,8,0.96)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          <span>Agent Trace</span>
          <span
            className="mono rounded-sm px-1.5 py-[1px] text-[9px] uppercase tracking-wider"
            style={{ background: "rgba(118,185,0,0.15)", color: "var(--green)" }}
          >
            multi-agent
          </span>
        </div>
        <div className="flex items-center gap-2">
          {popoutHref && (
            <a
              href={popoutHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mono rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors hover:bg-[rgba(255,255,255,0.04)]"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-2)",
                background: "rgba(0,0,0,0.4)",
              }}
              title="Open in dedicated mission control tab"
            >
              pop out ↗
            </a>
          )}
          <div className="mono flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: "var(--green)",
                animation: "bounce-dot 1.2s infinite",
              }}
            />
            LIVE
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}
              title="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <AgentDashboard events={events} totalTurns={totalTurns} variant={mode} />
    </aside>
  );
}
