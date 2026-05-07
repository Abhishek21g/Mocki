import { useEffect, useState } from "react";

const STORAGE_KEY = "mocki:tutorialDone";

const STEPS = [
  {
    title: "Your interview panel",
    body: "The interviewers on the left switch as the session progresses. The active one is highlighted.",
    anchor: "panel",
    position: "right" as const,
  },
  {
    title: "The question",
    body: "Read the question carefully. If it's a clarification round, the border turns yellow.",
    anchor: "question",
    position: "below" as const,
  },
  {
    title: "Type your answer here",
    body: "Write your full response. Take your time — there's no timer.",
    anchor: "answer",
    position: "above" as const,
  },
  {
    title: "Hold to talk",
    body: "Prefer speaking? Hold the mic button and talk — your words are transcribed in real time.",
    anchor: "voice",
    position: "above" as const,
  },
  {
    title: "Send your answer",
    body: "When you're happy with your response, click Send. The AI will evaluate and move to the next question.",
    anchor: "submit",
    position: "above" as const,
  },
];

type Props = { onDone: () => void };

export function TutorialOverlay({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function finish() {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    onDone();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") finish(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Dim overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          background: "rgba(0,0,0,0.55)",
          pointerEvents: "none",
        }}
      />

      {/* Centered tooltip card */}
      <div
        style={{
          position: "fixed",
          bottom: 100,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 61,
          width: "min(420px, 90vw)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "20px 24px 18px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Step indicator */}
        <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 3,
                flex: 1,
                borderRadius: 99,
                background: i <= step ? "var(--green)" : "var(--border)",
                transition: "background 200ms",
              }}
            />
          ))}
        </div>

        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>
          {current.title}
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 18 }}>
          {current.body}
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={finish}
            style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Skip tutorial
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                style={{ fontSize: 13, color: "var(--text-2)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 16px", cursor: "pointer" }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={() => isLast ? finish() : setStep((s) => s + 1)}
              className="gp-btn"
              style={{ fontSize: 13, padding: "7px 20px" }}
            >
              {isLast ? "Let's go →" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function shouldShowTutorial(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(STORAGE_KEY);
}
