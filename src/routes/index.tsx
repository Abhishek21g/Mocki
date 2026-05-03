import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { showToast } from "@/components/ghost/Toaster";
import { store } from "@/lib/ghost-store";
import { extractPdfText, PdfExtractionError } from "@/lib/pdf";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { primeAudio } from "@/lib/tts";
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
  const { getAccessToken, status, user } = useSupabaseAuth();
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
    // Unlock the audio element while we still have a user-activation gesture.
    // The first question is fetched from NVIDIA, which can take several
    // seconds — long enough for Chrome's autoplay window to expire. Priming
    // here makes the question audio play automatically on the next page.
    primeAudio();
    setLoading(true);
    try {
      const accessToken = getAccessToken();
      const res = await startInterview({
        data: {
          role,
          company,
          jobDescription,
          interview_type: interviewType as "technical" | "behavioral" | "mixed",
          resume,
          ...(accessToken ? { accessToken } : {}),
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
          roleProfile: res.roleProfile,
        },
        interviewers: res.interviewers,
        activeInterviewer: res.activeInterviewer,
        panelType: res.panelType,
        roleProfile: res.roleProfile,
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
          <h1>
            <HomeLogo
              resetOnClick={false}
              className="text-5xl font-extrabold tracking-tight md:text-6xl"
            />
          </h1>
          <p className="mt-3 text-base md:text-lg" style={{ color: "var(--text-2)" }}>
            Multi-agent panel interviews that adapt in real time
          </p>
          {status === "ready" && user && (
            <p
              className="mono mt-3 text-[11px] uppercase tracking-wider"
              style={{ color: "var(--green)" }}
            >
              Memory enabled · this session will train on your prior interviews
            </p>
          )}
          {status === "ready" && !user && (
            <p
              className="mono mt-3 text-[11px] uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              Sign in (top right) to save history and let the panel learn across sessions
            </p>
          )}
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
                <option value="technical">Role Skills (Job Scenarios + Problem Solving)</option>
                <option value="behavioral">Behavioral (Experience + Teamwork)</option>
                <option value="mixed">Mixed (Panel Style)</option>
              </select>
            </Field>
            <Field label="Your Resume" htmlElement="div">
              <ResumeDropzone
                disabled={loading}
                onParsed={(text) => {
                  setResume(text);
                }}
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

function ResumeDropzone({
  disabled,
  onParsed,
}: {
  disabled: boolean;
  onParsed: (text: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [charCount, setCharCount] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parseFile(file: File) {
    if (disabled || isParsing) return;
    setError(null);
    setIsParsing(true);
    try {
      const parsed = await extractPdfText(file);
      setFileName(file.name);
      setPages(parsed.pages);
      setCharCount(parsed.text.length);
      setTruncated(parsed.truncated);
      onParsed(parsed.text);
    } catch (err) {
      if (err instanceof PdfExtractionError) {
        setError(err.message);
      } else {
        setError("Could not process this file. Please try a different PDF.");
      }
      setFileName(null);
      setPages(null);
      setCharCount(null);
      setTruncated(false);
      onParsed("");
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/*
       * NOTE: This is intentionally a <div>, not a <label>. A <label> wrapping
       * the hidden <input type="file"> double-fires the picker because the
       * browser's native label-for-input forwarding *plus* the manual
       * fileInputRef.click() in onClick both queue an open. Using a <div>
       * keeps the explicit click/keydown handlers below as the sole trigger.
       */}
      <div
        className="rounded-xl border-2 border-dashed p-5 transition-all duration-200"
        role="button"
        tabIndex={disabled ? -1 : 0}
        style={{
          borderColor: isDragging ? "var(--green)" : "var(--border)",
          background: isDragging ? "rgba(118,185,0,0.07)" : "var(--surface2)",
          opacity: disabled ? 0.7 : 1,
          cursor: disabled || isParsing ? "not-allowed" : "pointer",
          boxShadow: isDragging
            ? "0 0 0 3px rgba(118,185,0,0.15)"
            : isPressed
              ? "0 0 0 2px rgba(118,185,0,0.12)"
              : "none",
          transform: isPressed ? "scale(0.995)" : "scale(1)",
        }}
        onClick={(event) => {
          if (disabled || isParsing) return;
          if (event.target instanceof HTMLInputElement) return;
          fileInputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (disabled || isParsing) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onMouseDown={() => {
          if (!disabled && !isParsing) setIsPressed(true);
        }}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void parseFile(file);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          disabled={disabled || isParsing}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void parseFile(file);
            }
            event.currentTarget.value = "";
          }}
        />
        <div className="text-sm">
          {!fileName && !isParsing && (
            <>
              <p className="font-medium">Drop your resume PDF here</p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                PDF only - max 10MB
              </p>
              <div className="mt-3">
                <span
                  className="inline-flex rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    borderColor: "rgba(118,185,0,0.45)",
                    color: "var(--green)",
                    background: "rgba(118,185,0,0.08)",
                  }}
                >
                  Click to choose PDF
                </span>
              </div>
            </>
          )}

          {isParsing && (
            <p className="flex items-center gap-2 font-medium">
              <span className="gp-spinner" /> Parsing {fileName ?? "resume.pdf"}...
            </p>
          )}

          {!isParsing && fileName && (
            <div>
              <p className="font-medium">{fileName}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                {pages} page{pages === 1 ? "" : "s"} parsed - {charCount} chars extracted
              </p>
              <div className="mt-3">
                <span
                  className="inline-flex rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-2)",
                    background: "var(--surface3)",
                  }}
                >
                  Click to replace PDF
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {truncated && (
        <p className="text-xs" style={{ color: "#fde68a" }}>
          Resume text was truncated to 20,000 characters.
        </p>
      )}
      {error && (
        <p className="text-xs" style={{ color: "#fca5a5" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  // Most fields wrap their input in a <label> so clicking the label text
  // focuses the input. The resume dropzone, however, contains a hidden
  // <input type="file"> — and a <label> ancestor will natively forward
  // every click to that input, which combines with the dropzone's own
  // onClick={fileInputRef.click()} to open the file picker twice. Pass
  // htmlElement="div" for any field whose child manages its own click
  // semantics.
  htmlElement = "label",
}: {
  label: string;
  children: React.ReactNode;
  htmlElement?: "label" | "div";
}) {
  const Tag = htmlElement;
  return (
    <Tag className="flex flex-col gap-2">
      <span
        className="mono text-[11px] uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
      {children}
    </Tag>
  );
}
