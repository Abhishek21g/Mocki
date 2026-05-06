import { useState } from "react";
import { createCheckoutSession } from "@/server/billing.functions";

export function UpgradeModal({
  interviewsUsed,
  accessToken,
  onClose,
}: {
  interviewsUsed: number;
  accessToken: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const { url } = await createCheckoutSession({
        data: { accessToken, returnUrl: window.location.origin },
      });
      if (url) window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ background: "var(--surface1)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black"
            style={{ background: "linear-gradient(135deg,#76b900,#3a5c00)", color: "#000" }}
          >
            ✦
          </div>
          <h2 className="text-2xl font-bold">You've used all 5 free interviews</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
            Upgrade to Mocki Pro for unlimited access
          </p>
        </div>

        {/* Usage bar */}
        <div className="mb-6">
          <div className="mb-1.5 flex justify-between text-xs" style={{ color: "var(--text-3)" }}>
            <span>Free interviews used</span>
            <span style={{ color: "var(--text-1)" }}>{interviewsUsed} / 5</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface3)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (interviewsUsed / 5) * 100)}%`,
                background: "linear-gradient(90deg,#76b900,#4d7a00)",
              }}
            />
          </div>
        </div>

        {/* Plan card */}
        <div
          className="mb-6 rounded-xl p-5"
          style={{ background: "var(--surface2)", border: "1.5px solid var(--green)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold">Mocki Pro</div>
              <div className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                Unlimited AI interviews
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black" style={{ color: "var(--green)" }}>$9</span>
              <span className="text-sm" style={{ color: "var(--text-3)" }}>/mo</span>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm" style={{ color: "var(--text-2)" }}>
            {[
              "Unlimited interviews",
              "All interview types — technical, behavioral, mixed",
              "Full debrief reports with scores",
              "Resume-aware AI panel",
              "Voice + webcam recording",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span style={{ color: "var(--green)" }}>✓</span> {f}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="gp-btn w-full text-base font-bold"
          style={{ padding: "14px" }}
        >
          {loading ? <><span className="gp-spinner" /> Redirecting to checkout…</> : "Upgrade to Pro →"}
        </button>
        <button
          onClick={onClose}
          className="mt-3 w-full text-sm"
          style={{ color: "var(--text-3)" }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
