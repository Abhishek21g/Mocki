import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { showToast } from "@/components/ghost/Toaster";
import { store } from "@/lib/ghost-store";
import { startInterview } from "@/server/interview.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "🧭 Mockpilot — AI Mock Interviews" },
      {
        name: "description",
        content:
          "Set up an adaptive mock panel interview tailored to your target role, company, resume, and job description.",
      },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const nav = useNavigate();
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [interviewType, setInterviewType] = useState("technical");
  const [resume, setResume] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = role.trim() && company.trim() && jobDescription.trim() && resume.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    try {
      const res = await startInterview({
        data: {
          role,
          company,
          jobDescription,
          interview_type: interviewType as "technical" | "behavioral" | "mixed",
          resume,
        },
      });
      store.set({
        sessionId: res.sessionId,
        setupData: {
          role,
          company,
          jobDescription,
          interview_type: interviewType,
          resume,
        },
        interviewers: res.interviewers,
        activeInterviewer: res.activeInterviewer,
        panelType: res.panelType,
        currentQuestion: res.question,
        currentFocus: res.focus,
        currentDifficulty: res.difficulty,
        currentCoordinatorReason: res.coordinatorReason,
        currentStage: res.stage,
        currentTurnType: res.turnType,
        currentRound: res.round,
        totalRounds: res.totalRounds,
        rounds: [],
        lastEvaluation: null,
        lastClarification: null,
        report: null,
      });
      nav({ to: "/interview" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to start interview");
      setLoading(false);
    }
  }

  return (
    <div className="grid-bg min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-5 py-16">
        <header className="mb-10 text-center fade-up">
          <h1
            className="text-5xl font-extrabold tracking-tight md:text-6xl"
            style={{ color: "var(--green)" }}
          >
            🧭 Mockpilot
          </h1>
          <p className="mt-3 text-base md:text-lg" style={{ color: "var(--text-2)" }}>
            Multi-agent panel interviews that adapt in real time
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="gp-card w-full p-8 md:p-10 fade-up"
          style={{
            boxShadow: "0 0 40px rgba(118,185,0,0.06)",
            animationDelay: "60ms",
          }}
        >
          <div className="flex flex-col gap-5">
            <Field label="Job Role">
              <input
                className="gp-input"
                placeholder="e.g. Software Engineer Intern"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={loading}
              />
            </Field>
            <Field label="Company">
              <input
                className="gp-input"
                placeholder="e.g. Google, Meta, Apple..."
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={loading}
              />
            </Field>
            <Field label="Job Description">
              <textarea
                className="gp-input"
                rows={6}
                style={{ resize: "vertical", lineHeight: 1.6 }}
                placeholder="Paste the job description or role requirements here so the panel can tailor its questions."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                disabled={loading}
              />
            </Field>
            <Field label="Interview Type">
              <select
                className="gp-input"
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value)}
                disabled={loading}
              >
                <option value="technical">Technical (DSA + System Design)</option>
                <option value="behavioral">Behavioral (Experience + Teamwork)</option>
                <option value="mixed">Mixed (Panel Style)</option>
              </select>
            </Field>
            <Field label="Your Resume">
              <textarea
                className="gp-input"
                rows={7}
                style={{ resize: "vertical", lineHeight: 1.6 }}
                placeholder="Paste your resume text here — the panel uses this to personalize questions and evaluate your answers against your actual experience."
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                disabled={loading}
              />
            </Field>
            <button type="submit" className="gp-btn w-full" disabled={!valid || loading}>
              {loading ? (
                <>
                  <span className="gp-spinner" /> Assembling your panel...
                </>
              ) : (
                <>Launch Mock Panel →</>
              )}
            </button>
          </div>
        </form>

        <footer className="mt-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
          Powered by NVIDIA Nemotron
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span
        className="mono text-[11px] uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
