import { PanelCard } from "./PanelCard";
import { FlowCard } from "./DevStrip";
import type { InterviewStage, Persona, TurnType } from "@/server/sessions.server";

export function MobileDrawer({
  open,
  onClose,
  interviewers,
  activeInterviewerId,
  devMode,
  currentStage,
  currentTurnType,
  currentFocus,
  currentCoordinatorReason,
}: {
  open: boolean;
  onClose: () => void;
  interviewers: Persona[];
  activeInterviewerId: string;
  devMode: boolean;
  currentStage: InterviewStage;
  currentTurnType: TurnType;
  currentFocus: string;
  currentCoordinatorReason: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 xl:hidden"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl p-5 flex flex-col gap-4"
        style={{ background: "var(--surface1)", maxHeight: "80vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            Interview Panel
          </span>
          <button
            onClick={onClose}
            className="text-sm"
            style={{ color: "var(--text-2)" }}
          >
            ✕ Close
          </button>
        </div>
        {interviewers.map((interviewer) => (
          <PanelCard
            key={interviewer.id}
            interviewer={interviewer}
            active={interviewer.id === activeInterviewerId}
          />
        ))}
        {devMode && (
          <FlowCard
            stage={currentStage}
            turnType={currentTurnType}
            focus={currentFocus}
            reason={currentCoordinatorReason}
          />
        )}
      </div>
    </div>
  );
}
