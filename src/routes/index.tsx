import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";
import { showToast } from "@/components/ghost/Toaster";
import { store } from "@/lib/ghost-store";
import { extractPdfText, PdfExtractionError } from "@/lib/pdf";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { primeAudio } from "@/lib/tts";
import { startInterview } from "@/server/interview.functions";
import { getAbandonedSessions, resumeInterview } from "@/server/sessions.functions";
import type { AbandonedSession, ResumedSession } from "@/server/sessions.functions";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useTrack } from "@/lib/use-track";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mocki — AI Mock Interviews" },
      {
        name: "description",
        content:
          "Practice with a resume-aware AI interview panel that asks realistic follow-ups and turns every session into a debrief report.",
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
  const [totalRounds, setTotalRounds] = useState<3 | 4 | 6>(4);
  const [resume, setResume] = useState("");
  const [loading, setLoading] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState<{ interviewsUsed: number } | null>(null);

  const isSignedIn = status === "ready" && !!user;

  const [abandonedSession, setAbandonedSession] = useState<AbandonedSession | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const howRef = useRef<HTMLElement | null>(null);
  const [panelProgress, setPanelProgress] = useState(0);
  const [howProgress, setHowProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const updateScrollEffects = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const vh = window.innerHeight || document.documentElement.clientHeight;
        setPanelProgress(progressForElement(panelRef.current, vh));
        setHowProgress(progressForElement(howRef.current, vh));
      });
    };

    updateScrollEffects();
    window.addEventListener("scroll", updateScrollEffects, { passive: true });
    window.addEventListener("resize", updateScrollEffects, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateScrollEffects);
      window.removeEventListener("resize", updateScrollEffects);
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !user) return;
    const token = getAccessToken();
    if (!token) return;
    getAbandonedSessions({ data: { accessToken: token } })
      .then((res: { ok: boolean; sessions: AbandonedSession[] }) => {
        if (res.ok && res.sessions.length > 0) setAbandonedSession(res.sessions[0]);
      })
      .catch(() => undefined);
  }, [status, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = role.trim() && company.trim() && jobDescription.trim() && resume.trim();

  async function handleResume() {
    if (!abandonedSession || resumeLoading) return;
    setResumeLoading(true);
    try {
      const token = getAccessToken();
      if (!token) return;
      const res = (await resumeInterview({
        data: { accessToken: token, sessionId: abandonedSession.sessionId },
      })) as { ok: true; session: ResumedSession } | { ok: false; reason: string; session: null };
      if (!res.ok) {
        showToast("Could not resume interview — please start a new one.");
        setBannerDismissed(true);
        return;
      }
      const s = res.session;
      store.set({
        sessionId: s.sessionId,
        setupData: {
          role: s.role,
          company: s.company,
          jobDescription: s.jobDescription,
          interview_type: s.interview_type,
          resume: s.resume,
          roleProfile: s.roleProfile,
        },
        interviewers: s.interviewers,
        activeInterviewer: s.activeInterviewer,
        panelType: "structured",
        roleProfile: s.roleProfile,
        currentQuestion: s.currentQuestion ?? "",
        currentFocus: s.lastPlan?.focus ?? "",
        currentDifficulty: s.lastPlan?.difficulty ?? "",
        currentCoordinatorReason: s.lastPlan?.reason ?? "",
        currentStage: s.currentStage,
        currentTurnType: s.lastPlan?.turn_type ?? "new_question",
        currentRound: s.currentRound,
        totalRounds: s.totalRounds,
        rounds: s.rounds,
        lastEvaluation: null,
        lastClarification: null,
        report: null,
      });
      nav({ to: "/interview" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to resume interview");
      setResumeLoading(false);
    }
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
  const panelists = buildPanelists(panelProgress);
  const processSteps = buildProcessSteps(howProgress);

  return (
    <div className="min-h-screen overflow-hidden bg-[oklch(0.15_0.02_258)] font-['Public_Sans',sans-serif] text-[oklch(0.95_0.012_80)]">
      {upgradeModal && accessTokenForModal && (
        <UpgradeModal
          interviewsUsed={upgradeModal.interviewsUsed}
          accessToken={accessTokenForModal}
          onClose={() => setUpgradeModal(null)}
        />
      )}
      <LandingNav />

      <main>
        <section className="mx-auto max-w-[1180px] px-6 py-24 text-center sm:px-10 md:pb-[90px] md:pt-[100px]">
          <div className="mb-[26px] text-[13px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.6_0.03_80)]">
            An interview practice tool
          </div>
          <h1 className="mx-auto mb-7 max-w-[880px] font-['Instrument_Serif',serif] text-[clamp(3.35rem,9vw,4.75rem)] font-normal leading-[1.05] tracking-normal">
            Practice interviews with a panel that reads your resume.
          </h1>
          <p className="mx-auto mb-10 max-w-[560px] text-lg leading-[1.65] text-[oklch(0.68_0.025_80)]">
            Mocki turns your resume and target job description into a realistic panel interview:
            three AI interviewers, natural follow-ups, voice practice, and a final debrief you can
            actually use.
          </p>
          <div className="mb-[70px] flex flex-col items-center justify-center gap-5 sm:flex-row sm:gap-7">
            <a className="landing-primary-button" href="#start">
              Start a mock interview
            </a>
            <a
              href="#panel"
              className="border-b border-[oklch(0.5_0.02_80)] text-[15px] font-semibold text-[oklch(0.95_0.012_80)] transition hover:border-[oklch(0.74_0.12_75)] hover:text-[oklch(0.74_0.12_75)]"
            >
              Meet the panel
            </a>
          </div>
          <div className="mx-auto grid max-w-[680px] grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-0">
            {heroStats.map((stat, index) => (
              <div
                key={stat.label}
                className="text-center sm:px-11"
                style={{
                  borderRight:
                    index < heroStats.length - 1 ? "1px solid oklch(0.3 0.025 258)" : "none",
                }}
              >
                <div className="font-['Instrument_Serif',serif] text-[40px] leading-none">
                  {stat.value}
                </div>
                <div className="mt-1 text-[13px] font-medium text-[oklch(0.6_0.025_80)]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[oklch(0.93_0.02_80)] py-[46px] text-[oklch(0.35_0.025_70)]">
          <p className="mb-7 text-center text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[oklch(0.42_0.025_70)]">
            Practice for the interviews candidates are actually seeing
          </p>
          <div className="landing-marquee-mask overflow-hidden">
            <div className="mocki-marquee-track flex w-max">
              {[...targetCompanies, ...targetCompanies].map((company, index) => (
                <span
                  key={`${company}-${index}`}
                  className="inline-block shrink-0 px-[34px] font-['Instrument_Serif',serif] text-xl"
                >
                  {company}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section
          id="panel"
          ref={panelRef}
          className="relative min-h-screen bg-[oklch(0.12_0.02_258)] px-6 py-24 sm:px-10 lg:py-32"
        >
          <div className="flex min-h-[calc(100vh-12rem)] items-center overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_45%,oklch(0.74_0.12_75_/_0.12),transparent_32%),radial-gradient(circle_at_24%_70%,oklch(0.55_0.14_264_/_0.18),transparent_34%)]" />
            <div className="relative mx-auto grid w-full max-w-[1180px] items-center gap-12 lg:grid-cols-[360px_1fr] lg:gap-[70px]">
              <div>
                <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.6_0.03_80)]">
                  Three-person panel
                </div>
                <h2 className="mb-4 font-['Instrument_Serif',serif] text-[48px] font-normal leading-[1.02]">
                  Scroll through the interview room.
                </h2>
                <p className="mb-8 max-w-[310px] text-[15px] leading-[1.65] text-[oklch(0.68_0.025_80)]">
                  Mocki does not feel like a static question bank. The panel rotates like a real
                  loop: practitioner, hiring manager, then recruiter.
                </p>
                <div className="flex flex-col gap-3">
                  {panelists.map((panelist) => (
                    <div
                      key={panelist.name}
                      className="landing-panel-rail-card"
                      data-active={panelist.active}
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                        style={{ background: panelist.avatarBg }}
                      >
                        <span className="font-['Instrument_Serif',serif] text-xl text-[oklch(0.98_0.01_80)]">
                          {panelist.initial}
                        </span>
                      </div>
                      <div>
                        <span
                          className="block text-[15px] font-semibold"
                          style={{ color: panelist.railColor }}
                        >
                          {panelist.name}
                        </span>
                        <span className="mt-0.5 block text-xs uppercase tracking-[0.08em] text-[oklch(0.55_0.025_80)]">
                          {panelist.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-panel-stage relative min-h-[520px]">
                {panelists
                  .filter((panelist) => panelist.active)
                  .map((panelist) => (
                    <div
                      key={panelist.name}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-9 px-6 text-center sm:px-12 lg:flex-row lg:text-left"
                      style={{
                        transform: `translateY(${panelist.offset}px) scale(${panelist.scale})`,
                      }}
                    >
                      <div
                        className="landing-panel-orb flex h-[178px] w-[178px] shrink-0 items-center justify-center rounded-full sm:h-[220px] sm:w-[220px]"
                        style={{
                          background: panelist.avatarBg,
                          boxShadow: `0 24px 80px ${panelist.glowColor}`,
                        }}
                      >
                        <span className="font-['Instrument_Serif',serif] text-[76px] text-[oklch(0.98_0.01_80)] sm:text-[96px]">
                          {panelist.initial}
                        </span>
                      </div>
                      <div className="max-w-[460px]">
                        <div className="mb-4 font-['Instrument_Serif',serif] text-[15px] tracking-[0.05em] text-[oklch(0.55_0.03_80)]">
                          {panelist.indexLabel}
                        </div>
                        <h3 className="mb-4 font-['Instrument_Serif',serif] text-[clamp(3.6rem,8vw,5.5rem)] font-normal leading-none">
                          {panelist.name}
                        </h3>
                        <div
                          className="mb-5 text-sm font-semibold uppercase tracking-[0.08em]"
                          style={{ color: panelist.roleColor }}
                        >
                          {panelist.role}
                        </div>
                        <p className="m-0 text-[17px] leading-[1.6] text-[oklch(0.78_0.025_80)]">
                          {panelist.desc}
                        </p>
                        <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-[oklch(0.3_0.025_258)]">
                          <div
                            className="h-full rounded-full bg-[oklch(0.74_0.12_75)] transition-[width] duration-200"
                            style={{ width: panelist.progressWidth }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="how"
          ref={howRef}
          className="relative min-h-screen border-t border-[oklch(0.3_0.025_258)] px-6 py-24 sm:px-10 lg:py-32"
        >
          <div className="flex min-h-[calc(100vh-12rem)] items-center overflow-hidden">
            <div className="mx-auto grid w-full max-w-[1180px] items-center gap-12 lg:grid-cols-[320px_1fr] lg:gap-[60px]">
              <div>
                <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-[oklch(0.6_0.03_80)]">
                  Process
                </div>
                <h2 className="mb-9 font-['Instrument_Serif',serif] text-[42px] font-normal leading-[1.1]">
                  How Mocki works
                </h2>
                <div className="flex flex-col gap-4">
                  {processSteps.map((step) => (
                    <div key={step.num} className="flex items-center gap-3.5">
                      <span
                        className="font-['Instrument_Serif',serif] text-xl"
                        style={{ color: step.railColor }}
                      >
                        {step.num}
                      </span>
                      <span className="h-px flex-1" style={{ background: step.railLine }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-process-stage relative min-h-[360px]">
                {processSteps
                  .filter((step) => step.active)
                  .map((step) => (
                    <div
                      key={step.num}
                      className="absolute inset-0 flex flex-col justify-center p-8 sm:p-12"
                      style={{
                        transform: `translateY(${step.offset}px)`,
                      }}
                    >
                      <div className="mb-3.5 font-['Instrument_Serif',serif] text-[26px] text-[oklch(0.74_0.12_75)]">
                        {step.num}
                      </div>
                      <h3 className="mb-4 text-[32px] font-bold text-[oklch(0.96_0.012_80)]">
                        {step.title}
                      </h3>
                      <p className="m-0 max-w-[540px] text-lg leading-[1.6] text-[oklch(0.78_0.025_80)]">
                        {step.desc}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-[100px] sm:px-10">
          <div className="mx-auto max-w-[1180px]">
            <div className="grid gap-12 lg:grid-cols-[320px_1fr] lg:gap-[60px]">
              <div>
                <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-[oklch(0.6_0.03_80)]">
                  Approach
                </div>
                <h2 className="mb-5 font-['Instrument_Serif',serif] text-[42px] font-normal leading-[1.1]">
                  Built for the messy middle of interview prep
                </h2>
                <p className="m-0 text-[15.5px] leading-[1.6] text-[oklch(0.68_0.025_80)]">
                  For the moment when generic question banks stop helping and you need practice that
                  reacts to your actual background.
                </p>
              </div>
              <div>
                {features.map((feature) => (
                  <div key={feature.title} className="border-t border-[oklch(0.3_0.025_258)] py-7">
                    <h3 className="mb-2 text-lg font-bold">{feature.title}</h3>
                    <p className="m-0 max-w-[560px] text-[15.5px] leading-[1.6] text-[oklch(0.68_0.025_80)]">
                      {feature.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="start" className="bg-[oklch(0.1_0.02_258)] px-6 py-24 sm:px-10">
          <div className="mx-auto max-w-[720px]">
            <div className="mb-11 text-center">
              <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-[oklch(0.6_0.03_80)]">
                Get started
              </div>
              <h2 className="mb-[18px] font-['Instrument_Serif',serif] text-[42px] font-normal leading-[1.1] text-[oklch(0.96_0.01_80)]">
                Start with the role you are chasing
              </h2>
              <p className="mx-auto m-0 max-w-[520px] text-base leading-[1.6] text-[oklch(0.68_0.025_80)]">
                Paste the job description, upload your resume PDF, and Mocki assembles a panel tuned
                to the company, role, interview length, and interview type.
              </p>
            </div>

            {isSignedIn && !bannerDismissed && abandonedSession && (
              <div className="mb-6 border border-[oklch(0.74_0.12_75_/_0.45)] bg-[oklch(0.74_0.12_75_/_0.08)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[oklch(0.96_0.01_80)]">
                      You have an unfinished interview
                    </p>
                    <p className="mt-1 text-[11px] text-[oklch(0.62_0.025_80)]">
                      {abandonedSession.role} at {abandonedSession.company}
                      {" · "}Round {abandonedSession.currentRound + 1}/
                      {abandonedSession.totalRounds}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleResume()}
                      disabled={resumeLoading}
                      className="landing-small-button disabled:opacity-60"
                    >
                      {resumeLoading ? "Resuming..." : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerDismissed(true)}
                      className="px-2 text-sm text-[oklch(0.62_0.025_80)] transition hover:text-[oklch(0.95_0.012_80)]"
                      aria-label="Dismiss"
                    >
                      x
                    </button>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="border-t border-[oklch(0.3_0.025_258)] pt-9">
              <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <LineField label="Job Role">
                  <input
                    className="landing-line-input"
                    placeholder="e.g. Software Engineer Intern"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={loading}
                  />
                </LineField>
                <LineField label="Company">
                  <input
                    className="landing-line-input"
                    placeholder="e.g. NVIDIA"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    disabled={loading}
                  />
                </LineField>
              </div>

              <LineField className="mb-[26px]" label="Job Description">
                <textarea
                  className="landing-line-input"
                  rows={3}
                  placeholder="Paste the job description here"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  disabled={loading}
                />
              </LineField>

              <div className="mb-[26px]">
                <div className="mb-2.5 text-[13px] font-semibold text-[oklch(0.7_0.025_80)]">
                  Interview Type
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {interviewTypes.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      disabled={loading}
                      onClick={() => setInterviewType(type.value)}
                      className="landing-choice-button"
                      data-selected={interviewType === type.value}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-[26px]">
                <div className="mb-2.5 text-[13px] font-semibold text-[oklch(0.7_0.025_80)]">
                  Interview Length
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {interviewLengths.map(({ val, label, sub }) => (
                    <button
                      key={val}
                      type="button"
                      disabled={loading}
                      onClick={() => setTotalRounds(val)}
                      className="landing-length-button"
                      data-selected={totalRounds === val}
                    >
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="mt-[3px] block text-xs text-[oklch(0.62_0.025_80)]">
                        {sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-[30px]">
                <div className="mb-2.5 text-[13px] font-semibold text-[oklch(0.7_0.025_80)]">
                  Your Resume
                </div>
                <ResumeDropzone
                  disabled={loading}
                  onParsed={(text) => setResume(text)}
                  onFileRaw={(file) => {
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
              </div>

              <button
                type="submit"
                className="landing-primary-button w-full disabled:cursor-not-allowed disabled:opacity-55"
                disabled={!valid || loading}
              >
                {loading ? "Assembling your panel..." : "Launch Mock Panel"}
              </button>
            </form>
          </div>
        </section>

        <section id="about" className="px-6 pb-[60px] pt-[90px] text-center sm:px-10">
          <h2 className="mb-4 font-['Instrument_Serif',serif] text-3xl font-normal">
            Keeping Mocki free to practice with
          </h2>
          <p className="mx-auto mb-[26px] max-w-[480px] text-[15.5px] leading-[1.6] text-[oklch(0.68_0.025_80)]">
            Mocki is free to use. If it helped you prep, a small donation keeps the panel running
            for the next candidate.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#" className="landing-primary-button">
              Buy us a coffee
            </a>
            <Link to="/about" className="landing-secondary-button">
              About the builders
            </Link>
          </div>
        </section>

        <footer className="border-t border-[oklch(0.3_0.025_258)] px-10 py-[26px] text-center">
          <span className="text-[13px] text-[oklch(0.5_0.025_80)]">Mocki · 2026</span>
        </footer>
      </main>
    </div>
  );
}

const heroStats = [
  { value: "3", label: "AI panelists" },
  { value: "3-6", label: "adaptive turns" },
  { value: "1", label: "debrief plan" },
];

function progressForElement(el: HTMLElement | null, vh: number) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const total = rect.height - vh;
  const progress = total > 0 ? -rect.top / total : 0;
  return Math.max(0, Math.min(1, progress));
}

const processStepDefs = [
  {
    num: "01",
    title: "Upload context",
    desc: "Add your resume PDF and the job description so the panel has the same material a real recruiter would read.",
  },
  {
    num: "02",
    title: "Meet the panel",
    desc: "Mocki creates a practitioner, hiring manager, and recruiter tuned to your target role.",
  },
  {
    num: "03",
    title: "Answer live",
    desc: "Type or speak your answers while the panel asks follow-ups instead of jumping through a static quiz.",
  },
  {
    num: "04",
    title: "Review the debrief",
    desc: "Get a score, strengths, weak spots, drill questions, and a study plan for the next practice session.",
  },
];

const features = [
  {
    title: "Resume-aware questions",
    desc: "The interview can ask about your actual projects, likely gaps, and the skills named in the job description.",
  },
  {
    title: "Real follow-ups",
    desc: "A coordinator and clarifier keep the conversation coherent, challenging vague answers when it matters.",
  },
  {
    title: "Actionable scoring",
    desc: "Each session ends with strengths, weaknesses, missed concepts, practice questions, and a focused study plan.",
  },
  {
    title: "Built for internships and new-grad roles",
    desc: "Use it for software engineering, behavioral, mixed panels, career fairs, and last-mile interview prep.",
  },
];

const panelistDefs = [
  {
    name: "Maya",
    role: "Practitioner",
    initial: "M",
    desc: "Digs into your technical decisions and the tradeoffs behind them.",
    hue: 264,
  },
  {
    name: "Jordan",
    role: "Hiring Manager",
    initial: "J",
    desc: "Weighs how you'd operate on a real team, not just the right answer.",
    hue: 155,
  },
  {
    name: "Avery",
    role: "Recruiter",
    initial: "A",
    desc: "Keeps the conversation moving and checks for fit against the role.",
    hue: 40,
  },
];

const targetCompanies = [
  "Intuit",
  "NVIDIA",
  "SpaceX",
  "Tesla",
  "AMD",
  "Anduril",
  "Google DeepMind",
  "Bloomberg",
  "IMC",
  "Jane Street",
  "Citadel",
  "Hudson River Trading",
];

const interviewTypes = [
  { value: "technical", label: "Role Skills" },
  { value: "behavioral", label: "Behavioral" },
  { value: "mixed", label: "Mixed Panel" },
];

const interviewLengths = [
  { val: 3, label: "Quick", sub: "3 questions · ~10 min" },
  { val: 4, label: "Standard", sub: "4 questions · ~15 min" },
  { val: 6, label: "Full Panel", sub: "6 questions · ~25 min" },
] as const;

function buildProcessSteps(progress: number) {
  const activeIndex = Math.round(progress * (processStepDefs.length - 1));
  return processStepDefs.map((step, i) => {
    const local = progress * (processStepDefs.length - 1) - i;
    const opacity = i === activeIndex ? 1 : 0;
    const offset = Math.max(-1, Math.min(1, local)) * 26;
    const active = i === activeIndex;
    return {
      ...step,
      active,
      opacity,
      offset: active ? 0 : offset,
      railColor: active ? "oklch(0.74 0.12 75)" : "oklch(0.5 0.03 80)",
      railLine: active ? "oklch(0.74 0.12 75)" : "oklch(0.3 0.025 258)",
    };
  });
}

function buildPanelists(progress: number) {
  const activeIndex = Math.round(progress * (panelistDefs.length - 1));
  return panelistDefs.map((panelist, i) => {
    const local = progress * (panelistDefs.length - 1) - i;
    const opacity = i === activeIndex ? 1 : 0;
    const offset = Math.max(-1, Math.min(1, local)) * 26;
    const active = i === activeIndex;
    return {
      ...panelist,
      indexLabel: `0${i + 1} / 0${panelistDefs.length}`,
      avatarBg: `oklch(0.55 0.14 ${panelist.hue})`,
      roleColor: active ? `oklch(0.78 0.1 ${panelist.hue})` : "oklch(0.55 0.025 80)",
      railColor: active ? "oklch(0.9 0.02 80)" : "oklch(0.5 0.025 80)",
      active,
      glowColor: `oklch(0.55 0.14 ${panelist.hue} / 0.34)`,
      opacity,
      offset: active ? 0 : offset,
      scale: active ? 1 : 0.96,
      progressWidth: `${Math.min(100, Math.max(8, (activeIndex + 1) * 33.333))}%`,
    };
  });
}

function LandingNav() {
  return (
    <nav className="mx-auto flex max-w-[1180px] items-center justify-between border-b border-[oklch(0.3_0.025_258)] px-6 py-[30px] pr-[150px] sm:px-10 lg:pr-[360px] xl:pr-[520px]">
      <Link
        to="/"
        className="font-['Instrument_Serif',serif] text-2xl tracking-normal text-[oklch(0.95_0.012_80)]"
      >
        Mocki
      </Link>
      <div className="hidden items-center gap-[34px] md:flex">
        <a className="landing-nav-link" href="#panel">
          Meet the panel
        </a>
        <a className="landing-nav-link" href="#start">
          Start
        </a>
        <Link className="landing-nav-link" to="/about">
          About
        </Link>
      </div>
    </nav>
  );
}

function LineField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-[13px] font-semibold text-[oklch(0.7_0.025_80)]">
        {label}
      </span>
      {children}
    </label>
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
        className="rounded-[4px] border border-dashed p-[26px] text-center transition-all duration-200"
        role="button"
        tabIndex={disabled ? -1 : 0}
        style={{
          borderColor: isDragging ? "oklch(0.74 0.12 75)" : "oklch(0.35 0.025 258)",
          background: isDragging ? "oklch(0.74 0.12 75 / 0.08)" : "transparent",
          opacity: disabled ? 0.7 : 1,
          cursor: disabled || isParsing ? "not-allowed" : "pointer",
          boxShadow: isDragging
            ? "0 0 0 3px oklch(0.74 0.12 75 / 0.14)"
            : isPressed
              ? "0 0 0 2px oklch(0.74 0.12 75 / 0.1)"
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
              <p className="font-semibold text-[oklch(0.85_0.015_80)]">Drop your resume PDF here</p>
              <p className="mt-1 text-[12.5px] text-[oklch(0.6_0.025_80)]">PDF only · max 10MB</p>
              <div className="mt-3">
                <span
                  className="inline-flex rounded-[4px] border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    borderColor: "oklch(0.74 0.12 75 / 0.45)",
                    color: "oklch(0.85 0.1 75)",
                    background: "oklch(0.74 0.12 75 / 0.08)",
                  }}
                >
                  Click to choose PDF
                </span>
              </div>
            </>
          )}

          {isParsing && (
            <p className="flex items-center justify-center gap-2 font-medium text-[oklch(0.85_0.015_80)]">
              <span className="gp-spinner" /> Parsing {fileName ?? "resume.pdf"}...
            </p>
          )}

          {!isParsing && fileName && (
            <div>
              <p className="font-semibold text-[oklch(0.85_0.015_80)]">{fileName}</p>
              <p className="mt-1 text-xs text-[oklch(0.6_0.025_80)]">
                {pages} page{pages === 1 ? "" : "s"} parsed - {charCount} chars extracted
              </p>
              <div className="mt-3">
                <span
                  className="inline-flex rounded-[4px] border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    borderColor: "oklch(0.35 0.025 258)",
                    color: "oklch(0.8 0.02 80)",
                    background: "transparent",
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
      style={{
        background: "rgba(245,158,11,0.1)",
        border: "1px solid rgba(245,158,11,0.3)",
        color: "#f59e0b",
      }}
    >
      <p className="font-semibold mb-1">⚠️ Open in a real browser to sign in</p>
      <p className="text-xs" style={{ color: "#fbbf24" }}>
        Google blocks sign-in from in-app browsers.{" "}
        {isIOS ? 'Tap the ··· menu → "Open in Safari"' : 'Tap the ··· menu → "Open in Chrome"'} then
        sign in from there.
      </p>
    </div>
  );
}

function LoginPage({
  signInWithGoogle,
  signInWithGitHub,
  signInWithMagicLink,
}: {
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signInWithGitHub: (redirectTo?: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
}) {
  const inApp = typeof window !== "undefined" && isInAppBrowser();
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const track = useTrack();

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

        <div className="gp-card p-8" style={{ boxShadow: "0 0 40px rgba(118,185,0,0.08)" }}>
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
              onClick={() => {
                if (!inApp) {
                  track("sign_in_clicked", { provider: "google" });
                  signInWithGoogle();
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                <path
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                  fill="#34A853"
                />
                <path
                  d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>

            <button
              className="gp-btn-outline w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition hover:border-white/30"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface2)",
                color: "var(--text)",
                ...(inApp ? { opacity: 0.4, cursor: "not-allowed" } : {}),
              }}
              disabled={inApp}
              onClick={() => {
                if (!inApp) {
                  track("sign_in_clicked", { provider: "github" });
                  signInWithGitHub();
                }
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ flexShrink: 0 }}
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
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
              <div
                className="rounded-xl p-4 text-center text-sm"
                style={{
                  background: "rgba(118,185,0,0.08)",
                  border: "1px solid rgba(118,185,0,0.25)",
                }}
              >
                <p className="font-semibold mb-1" style={{ color: "var(--green)" }}>
                  ✓ Check your email
                </p>
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
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--surface2)",
                    color: "var(--text-2)",
                  }}
                  disabled={!magicEmail.trim() || magicLoading}
                >
                  {magicLoading ? (
                    <>
                      <span className="gp-spinner" /> Sending…
                    </>
                  ) : (
                    "Send sign-in link →"
                  )}
                </button>
              </form>
            )}

            <div className="flex items-center gap-3" style={{ color: "var(--text-3)" }}>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-xs">What you get</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>

            <ul
              className="text-left text-sm flex flex-col gap-2"
              style={{ color: "var(--text-2)" }}
            >
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

        <div
          className="mt-6 flex items-center justify-center gap-3 text-xs"
          style={{ color: "var(--text-3)" }}
        >
          <span>Powered by NVIDIA Nemotron</span>
          <span>·</span>
          <Link to="/about" className="hover:text-white transition-colors">
            About & Feedback
          </Link>
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
