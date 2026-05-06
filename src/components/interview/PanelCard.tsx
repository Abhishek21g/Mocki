import { initials } from "@/lib/ghost-utils";
import type { Persona } from "@/server/sessions.server";

export function PanelCard({ interviewer, active }: { interviewer: Persona; active: boolean }) {
  return (
    <div
      className="rounded-2xl border p-4 transition-colors"
      style={{
        borderColor: active ? "rgba(118,185,0,0.55)" : "var(--border)",
        background: active ? "rgba(118,185,0,0.08)" : "var(--surface2)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-black"
          style={{
            background: active
              ? "linear-gradient(135deg, var(--green), #4d7a00)"
              : "var(--surface3)",
            color: active ? "#000" : "var(--text)",
          }}
        >
          {initials(interviewer.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-sm font-semibold">{interviewer.name}</div>
            {active && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                style={{
                  background: "var(--green-dim)",
                  color: "var(--green)",
                }}
              >
                Live
              </span>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            {interviewer.title}
          </div>
        </div>
      </div>
      <div
        className="mt-3 rounded-xl px-3 py-2 text-xs"
        style={{ background: "var(--surface3)", color: "var(--text-2)" }}
      >
        {interviewer.focus}
      </div>
      <div className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>
        {interviewer.personality}
      </div>
    </div>
  );
}
