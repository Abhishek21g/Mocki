import { useState } from "react";
import { submitFeedback } from "@/server/feedback.functions";

interface FeedbackModalProps {
  sessionId: string;
  accessToken: string;
  onClose: () => void;
}

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm leading-snug" style={{ color: "var(--text-2)" }}>
        {label}
      </span>
      <div className="flex shrink-0">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? 0 : n)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
              lineHeight: 1,
              padding: "2px 3px",
              color: n <= value ? "#fbbf24" : "var(--border)",
              transition: "color 100ms",
            }}
          >
            {n <= value ? "★" : "☆"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FeedbackModal({ sessionId, accessToken, onClose }: FeedbackModalProps) {
  const [feltRealistic, setFeltRealistic] = useState(0);
  const [questionsRelevant, setQuestionsRelevant] = useState(0);
  const [reportUseful, setReportUseful] = useState(0);
  const [wouldUseAgain, setWouldUseAgain] = useState<boolean | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitFeedback({
        data: {
          sessionId,
          ...(accessToken ? { accessToken } : {}),
          ...(feltRealistic > 0 ? { felt_realistic: feltRealistic } : {}),
          ...(questionsRelevant > 0 ? { questions_relevant: questionsRelevant } : {}),
          ...(reportUseful > 0 ? { report_useful: reportUseful } : {}),
          ...(wouldUseAgain !== null ? { would_use_again: wouldUseAgain } : {}),
          ...(freeText.trim() ? { free_text: freeText.trim() } : {}),
        },
      });
      setDone(true);
      setTimeout(onClose, 900);
    } catch {
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl"
        style={{ background: "var(--surface2)", borderColor: "var(--border)" }}
      >
        {done ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span style={{ fontSize: 40 }}>🙏</span>
            <p className="mt-1 text-base font-semibold">Thanks for the feedback!</p>
            <p className="text-sm" style={{ color: "var(--text-3)" }}>
              Taking you to your report…
            </p>
          </div>
        ) : (
          <div className="p-6">
            {/* Header */}
            <div className="mb-5">
              <h2 className="text-lg font-bold tracking-tight">How did it go?</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-3)" }}>
                Takes 30 seconds. Helps us improve.
              </p>
            </div>

            {/* Star ratings */}
            <div
              className="mb-4 flex flex-col gap-3 rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
            >
              <StarRow
                label="Felt like a real interview"
                value={feltRealistic}
                onChange={setFeltRealistic}
              />
              <StarRow
                label="Questions were relevant"
                value={questionsRelevant}
                onChange={setQuestionsRelevant}
              />
              <StarRow
                label="Report was useful"
                value={reportUseful}
                onChange={setReportUseful}
              />
            </div>

            {/* Yes / No toggle */}
            <div
              className="mb-4 rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
            >
              <p className="mb-3 text-sm" style={{ color: "var(--text-2)" }}>
                Would you use Mocki again before a real interview?
              </p>
              <div className="flex gap-2">
                {([true, false] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setWouldUseAgain(wouldUseAgain === v ? null : v)}
                    className="flex-1 rounded-lg border py-2 text-sm font-medium transition-all"
                    style={{
                      borderColor:
                        wouldUseAgain === v ? "rgba(118,185,0,0.55)" : "var(--border)",
                      background:
                        wouldUseAgain === v ? "rgba(118,185,0,0.10)" : "transparent",
                      color: wouldUseAgain === v ? "var(--green)" : "var(--text-2)",
                    }}
                  >
                    {v ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </div>

            {/* Free text */}
            <div className="mb-5">
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value.slice(0, 500))}
                placeholder="Anything feel off? (optional)"
                rows={3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "none",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 13,
                  color: "var(--text)",
                  fontFamily: "inherit",
                  outline: "none",
                  lineHeight: 1.6,
                }}
              />
              {freeText.length > 0 && (
                <p
                  className="mono mt-1 text-right text-[10px]"
                  style={{ color: "var(--text-3)" }}
                >
                  {freeText.length}/500
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="gp-btn flex-1 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <span className="gp-spinner" /> Submitting…
                  </>
                ) : (
                  "Submit feedback"
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-sm transition-opacity hover:opacity-70"
                style={{ color: "var(--text-3)" }}
              >
                Skip →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
