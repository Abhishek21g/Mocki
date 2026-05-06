import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { showToast } from "@/components/ghost/Toaster";
import { store } from "@/lib/ghost-store";
import { extractPdfText, PdfExtractionError } from "@/lib/pdf";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { primeAudio } from "@/lib/tts";
import { startInterview } from "@/server/interview.functions";
import { UpgradeModal } from "@/components/UpgradeModal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mocki — AI Mock Interviews" },
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
  const { getAccessToken, status, user, signInWithGoogle, signInWithGitHub, signInWithMagicLink } = useSupabaseAuth();
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [interviewType, setInterviewType] = useState("technical");
  const [totalRounds, setTotalRounds] = useState<3 | 4 | 6>(4);
  const [resume, setResume] = useState("");
  const [loading, setLoading] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState<{ interviewsUsed: number } | null>(null);

  const isSignedIn = status === "ready" && !!user;

  const valid = role.trim() && company.trim() && jobDescription.trim() && resume.trim();

  // Not signed in → show login page
  if (status === "ready" && !user) {
    return <LoginPage signInWithGoogle={signInWithGoogle} signInWithGitHub={signInWithGitHub} signInWithMagicLink={signInWithMagicLink} />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
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
          totalRounds,
          resume,
          ...(accessToken ? { accessToken } : {}),
        },
      });

      const session = res;
      store.set({
        sessionId: session.sessionId,
        setupData: {
          role,
          company,
          jobDescription,
          interview_type: interviewType,
          resume,
          roleProfile: session.roleProfile,
        },
        interviewers: session.interviewers,
        activeInterviewer: session.activeInterviewer,
        panelType: session.panelType,
        roleProfile: session.roleProfile,
        currentQuestion: session.question,
        currentFocus: session.focus,
        currentDifficulty: session.difficulty,
        currentCoordinatorReason: session.coordinatorReason,
        currentStage: session.stage,
        currentTurnType: session.turnType,
        currentRound: session.round,
        totalRounds: session.totalRounds,
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

  const accessTokenForModal = getAccessToken();

  return (
    <div className="grid-bg min-h-screen">
      {upgradeModal && accessTokenForModal && (
        <UpgradeModal
          interviewsUsed={upgradeModal.interviewsUsed}
          accessToken={accessTokenForModal}
          onClose={() => setUpgradeModal(null)}
        />
      )}
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
              Memory enabled · the panel learns from your prior sessions
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
            <Field label="Interview Length">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { val: 3, label: "Quick", sub: "3 questions · ~10 min" },
                  { val: 4, label: "Standard", sub: "4 questions · ~15 min" },
                  { val: 6, label: "Full Panel", sub: "6 questions · ~25 min" },
                ] as const).map(({ val, label, sub }) => (
                  <button
                    key={val}
                    type="button"
                    disabled={loading}
                    onClick={() => setTotalRounds(val)}
                    className="rounded-xl border p-3 text-left transition-all"
                    style={{
                      borderColor: totalRounds === val ? "var(--green)" : "var(--border)",
                      background: totalRounds === val ? "rgba(118,185,0,0.08)" : "var(--surface2)",
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    <div className="text-sm font-semibold" style={{ color: totalRounds === val ? "var(--green)" : "var(--text-1)" }}>
                      {label}
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                      {sub}
                    </div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Your Resume" htmlElement="div">
              <ResumeDropzone
                disabled={loading}
                onParsed={(text) => setResume(text)}
                onFileRaw={(file) => {
                  // Upload raw PDF to DO Spaces in the background
                  const token = getAccessToken();
                  if (!token) return;
                  const tempId = crypto.randomUUID();
                  const reader = new FileReader();
                  reader.onload = () => {
                    const b64 = (reader.result as string).split(",")[1];
                    import("@/server/upload.functions").then(({ uploadResumePdf }) => {
                      uploadResumePdf({
                        data: {
                          accessToken: token,
                          fileName: file.name,
                          fileBase64: b64,
                          sessionId: tempId,
                        },
                      }).catch(() => undefined);
                    });
                  };
                  reader.readAsDataURL(file);
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

        <footer className="mt-8 text-center text-xs flex items-center justify-center gap-4" style={{ color: "var(--text-3)" }}>
          <span>Powered by NVIDIA Nemotron</span>
          <span>·</span>
          <Link to="/about" className="hover:text-white transition-colors">About & Feedback</Link>
        </footer>
      </div>
    </div>
  );
}

function ResumeDropzone({
  disabled,
  onParsed,
  onFileRaw,
}: {
  disabled: boolean;
  onParsed: (text: string) => void;
  onFileRaw?: (file: File) => void;
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
      onFileRaw?.(file);
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

function isInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /LinkedIn|FBAN|FBAV|Instagram|Twitter|line\/|MicroMessenger|GSA\//.test(ua);
}

function InAppBrowserBanner() {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <div
      className="mb-4 rounded-xl p-4 text-sm text-left"
      style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}
    >
      <p className="font-semibold mb-1">⚠️ Open in a real browser to sign in</p>
      <p className="text-xs" style={{ color: "#fbbf24" }}>
        Google blocks sign-in from in-app browsers.{" "}
        {isIOS
          ? 'Tap the ··· menu → "Open in Safari"'
          : 'Tap the ··· menu → "Open in Chrome"'}{" "}
        then sign in from there.
      </p>
    </div>
  );
}

function LoginPage({ signInWithGoogle, signInWithGitHub, signInWithMagicLink }: {
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signInWithGitHub: (redirectTo?: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
}) {
  const inApp = typeof window !== "undefined" && isInAppBrowser();
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!magicEmail.trim() || magicLoading) return;
    setMagicLoading(true);
    try {
      await signInWithMagicLink(magicEmail.trim());
      setMagicSent(true);
    } catch {
      // show nothing — Supabase always returns success to prevent email enumeration
      setMagicSent(true);
    } finally {
      setMagicLoading(false);
    }
  }
  return (
    <div className="grid-bg min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md fade-up text-center">
        <HomeLogo
          resetOnClick={false}
          className="text-5xl font-extrabold tracking-tight md:text-6xl"
        />
        <p className="mt-3 text-base md:text-lg mb-10" style={{ color: "var(--text-2)" }}>
          Multi-agent AI mock interviews that adapt in real time
        </p>

        <div
          className="gp-card p-8"
          style={{ boxShadow: "0 0 40px rgba(118,185,0,0.08)" }}
        >
          <div className="flex flex-col gap-4">
            {inApp && <InAppBrowserBanner />}
            <div className="flex flex-col gap-1 mb-2">
              <h2 className="text-lg font-bold">Sign in to get started</h2>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                Your interview history and panel memory are saved to your account.
              </p>
            </div>

            <button
              className="gp-btn w-full"
              disabled={inApp}
              style={inApp ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
              onClick={() => !inApp && signInWithGoogle(window.location.href)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <button
              className="gp-btn-outline w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition hover:border-white/30"
              style={{ borderColor: "var(--border)", background: "var(--surface2)", color: "var(--text)", ...(inApp ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
              disabled={inApp}
              onClick={() => !inApp && signInWithGitHub(window.location.href)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>

            <div className="flex items-center gap-3" style={{ color: "var(--text-3)" }}>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-xs">or</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>

            {/* Magic link — works from any browser including in-app */}
            {magicSent ? (
              <div className="rounded-xl p-4 text-center text-sm" style={{ background: "rgba(118,185,0,0.08)", border: "1px solid rgba(118,185,0,0.25)" }}>
                <p className="font-semibold mb-1" style={{ color: "var(--green)" }}>✓ Check your email</p>
                <p className="text-xs" style={{ color: "var(--text-2)" }}>
                  We sent a sign-in link to <strong>{magicEmail}</strong>. Tap it to continue.
                </p>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="flex flex-col gap-2">
                <input
                  className="gp-input"
                  type="email"
                  placeholder="Sign in with email link"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  disabled={magicLoading}
                />
                <button
                  type="submit"
                  className="gp-btn-outline w-full rounded-xl border px-4 py-3 text-sm font-semibold transition"
                  style={{ borderColor: "var(--border)", background: "var(--surface2)", color: "var(--text-2)" }}
                  disabled={!magicEmail.trim() || magicLoading}
                >
                  {magicLoading ? <><span className="gp-spinner" /> Sending…</> : "Send sign-in link →"}
                </button>
              </form>
            )}

            <div className="flex items-center gap-3" style={{ color: "var(--text-3)" }}>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-xs">What you get</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>

            <ul className="text-left text-sm flex flex-col gap-2" style={{ color: "var(--text-2)" }}>
              {[
                "Adaptive 3-person AI interview panel",
                "Tailored to your resume + job description",
                "Real-time voice with NVIDIA Magpie TTS",
                "Full evaluation + debrief after each interview",
                "Panel learns from your past sessions",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span style={{ color: "var(--green)", flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 text-xs" style={{ color: "var(--text-3)" }}>
          <span>Powered by NVIDIA Nemotron</span>
          <span>·</span>
          <Link to="/about" className="hover:text-white transition-colors">About & Feedback</Link>
        </div>
      </div>
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
