import { HomeLogo } from "@/components/ghost/HomeLogo";
import type { Persona } from "@/server/sessions.server";

export function TopBar({
  role,
  company,
  round,
  total,
  onShowPanel,
  activeInterviewer,
}: {
  role: string;
  company: string;
  round: number;
  total: number;
  onShowPanel: () => void;
  activeInterviewer: Persona;
}) {
  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 flex h-[60px] items-center justify-between px-4 md:px-8"
      style={{
        background: "rgba(8,8,8,0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid #1a1a1a",
      }}
    >
      {/* Left: logo + mobile panel button */}
      <div className="flex items-center gap-3">
        <HomeLogo className="text-base" />
        {/* Mobile only — show active interviewer + tap to open panel */}
        <button
          type="button"
          onClick={onShowPanel}
          className="xl:hidden flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--surface2)" }}
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "var(--green-dim)", color: "var(--green)" }}
          >
            {activeInterviewer.name[0]}
          </span>
          <span>{activeInterviewer.name}</span>
        </button>
      </div>

      {/* Center: role @ company — desktop only */}
      <div className="hidden text-sm md:block">
        <span style={{ color: "var(--text-2)" }}>{role}</span>
        <span style={{ color: "var(--text-3)" }}> @ </span>
        <span>{company}</span>
      </div>

      {/* Right: progress dots + turn counter */}
      <div className="flex items-center gap-2 md:gap-3">
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => {
            const completed = i < round - 1;
            const current = i === round - 1;
            return (
              <span
                key={i}
                className="h-2 w-2 rounded-full md:h-2.5 md:w-2.5"
                style={{
                  background: completed ? "var(--green)" : "transparent",
                  border: `2px solid ${completed || current ? "var(--green)" : "var(--border2)"}`,
                }}
              />
            );
          })}
        </div>
        <div className="mono text-xs" style={{ color: "var(--text-2)" }}>
          <span className="hidden sm:inline">Turn </span>{round}/{total}
        </div>
      </div>
    </header>
  );
}
