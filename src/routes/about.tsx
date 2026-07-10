import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About - Mocki" },
      {
        name: "description",
        content:
          "Meet the team behind Mocki, a resume-aware AI mock interview platform built at BeaverHacks 2026.",
      },
    ],
  }),
  component: AboutPage,
});

const TEAM = [
  {
    name: "Abhishek Enaguthi",
    linkedin: "https://www.linkedin.com/in/abhishekenaguthi/",
    initial: "A",
    color: "#76b900",
  },
  {
    name: "Muralikrishna Inti",
    linkedin: "https://www.linkedin.com/in/muralikinti/",
    initial: "M",
    color: "#4d7a00",
  },
  {
    name: "Mithun Karthikeyan",
    linkedin: "https://www.linkedin.com/in/mithunkarth",
    initial: "M",
    color: "#76b900",
  },
  {
    name: "Ross Henderson",
    linkedin: "https://www.linkedin.com/in/ross-henderson-9b0ba2257/",
    initial: "R",
    color: "#4d7a00",
  },
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-[oklch(0.15_0.02_258)] font-['Public_Sans',sans-serif] text-[oklch(0.95_0.012_80)]">
      <nav className="mx-auto flex max-w-[1180px] items-center justify-between border-b border-[oklch(0.3_0.025_258)] px-6 py-[30px] sm:px-10">
        <Link
          to="/"
          className="font-['Instrument_Serif',serif] text-2xl tracking-normal text-[oklch(0.95_0.012_80)]"
        >
          Mocki
        </Link>
        <div className="flex items-center gap-7">
          <a className="landing-nav-link hidden sm:inline" href="#team">
            Team
          </a>
          <a className="landing-nav-link hidden sm:inline" href="#feedback">
            Feedback
          </a>
          <Link className="landing-nav-link hidden sm:inline" to="/#start">
            Start
          </Link>
        </div>
      </nav>

      <main>
        <section className="mx-auto grid min-h-[calc(100vh-92px)] max-w-[1180px] items-center gap-14 px-6 py-24 sm:px-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <h1 className="max-w-[620px] font-['Instrument_Serif',serif] text-[clamp(4rem,9vw,6.5rem)] font-normal leading-[0.95] tracking-normal">
              Built by students who needed better reps.
            </h1>
            <p className="mt-8 max-w-[560px] text-lg leading-[1.7] text-[oklch(0.68_0.025_80)]">
              Mocki is a team-built AI mock interview platform from BeaverHacks 2026. It was made
              for candidates who want practice that reacts to their resume, target role, and actual
              answers instead of walking through another static list of questions.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link className="landing-primary-button" to="/#start">
                Start a mock interview
              </Link>
              <a
                href="https://www.buymeacoffee.com/enaguthi"
                target="_blank"
                rel="noreferrer"
                aria-label="Buy me a coffee"
              >
                <img
                  src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                  alt="Buy Me a Coffee"
                  className="landing-bmc-image"
                />
              </a>
            </div>
          </div>

          <div className="landing-panel-stage relative min-h-[500px]">
            <div className="absolute inset-0 flex flex-col justify-center p-8 sm:p-12">
              <div className="mb-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.6_0.03_80)]">
                BeaverHacks 2026
              </div>
              <h2 className="font-['Instrument_Serif',serif] text-[clamp(3rem,6vw,4.7rem)] font-normal leading-none">
                NVIDIA track winner.
              </h2>
              <p className="mt-6 max-w-[520px] text-[16px] leading-[1.7] text-[oklch(0.72_0.025_80)]">
                The product uses a multi-agent interview flow powered by NVIDIA Nemotron, with
                supporting voice and speech systems to make interview practice feel closer to a real
                panel.
              </p>
              <div className="mt-9 grid gap-3 sm:grid-cols-3">
                {["Resume-aware", "Panel-style", "Debrief-driven"].map((item) => (
                  <div
                    key={item}
                    className="border-t border-[oklch(0.35_0.025_258)] pt-4 text-sm font-semibold text-[oklch(0.86_0.02_80)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="team"
          className="border-y border-[oklch(0.3_0.025_258)] bg-[oklch(0.12_0.02_258)] px-6 py-24 sm:px-10"
        >
          <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[320px_1fr] lg:gap-[70px]">
            <div>
              <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.6_0.03_80)]">
                The team
              </div>
              <h2 className="font-['Instrument_Serif',serif] text-[48px] font-normal leading-[1.05]">
                The builders behind Mocki.
              </h2>
              <p className="mt-5 text-[15px] leading-[1.65] text-[oklch(0.68_0.025_80)]">
                Mocki was built as a team project, with each person helping turn interview prep into
                something more repeatable, realistic, and useful.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {TEAM.map((member) => (
                <a
                  key={member.name}
                  href={member.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-panel-rail-card landing-team-card min-h-[96px]"
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                    style={{ background: member.color }}
                  >
                    <span className="font-['Instrument_Serif',serif] text-2xl text-[oklch(0.98_0.01_80)]">
                      {member.initial}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[15px] font-semibold text-[oklch(0.92_0.012_80)]">
                      {member.name}
                    </span>
                    <span className="mt-1 block text-xs uppercase tracking-[0.08em] text-[oklch(0.55_0.025_80)]">
                      LinkedIn
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24 sm:px-10">
          <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[320px_1fr] lg:gap-[70px]">
            <div>
              <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-[oklch(0.6_0.03_80)]">
                Built with
              </div>
              <h2 className="font-['Instrument_Serif',serif] text-[42px] font-normal leading-[1.1]">
                A practical stack for a real interview loop.
              </h2>
            </div>
            <div>
              {[
                "NVIDIA Nemotron Nano 9B",
                "NVIDIA Magpie TTS",
                "NVIDIA Riva ASR",
                "TanStack Start",
                "Supabase",
                "Vercel",
                "Railway",
              ].map((tech) => (
                <div key={tech} className="border-t border-[oklch(0.3_0.025_258)] py-5">
                  <span className="text-lg font-bold">{tech}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <FeedbackForm />

        <footer className="border-t border-[oklch(0.3_0.025_258)] px-10 py-[26px] text-center">
          <div className="mb-3 flex items-center justify-center gap-6 text-sm">
            <Link to="/" className="landing-nav-link">
              Back to Mocki
            </Link>
            <Link to="/#start" className="landing-nav-link">
              Start
            </Link>
          </div>
          <span className="text-[13px] text-[oklch(0.5_0.025_80)]">Mocki · 2026</span>
        </footer>
      </main>
    </div>
  );
}

function FeedbackForm() {
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating || !message.trim()) return;
    setLoading(true);
    try {
      await fetch("https://formspree.io/f/xjglrwoe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ rating, message, email }),
      });
      setSubmitted(true);
    } catch {
      // Still show success — don't block on network errors
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="feedback"
      className="border-t border-[oklch(0.3_0.025_258)] bg-[oklch(0.1_0.02_258)] px-6 py-24 sm:px-10"
    >
      <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[320px_1fr] lg:gap-[70px]">
        <div>
          <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-[oklch(0.6_0.03_80)]">
            Feedback
          </div>
          <h2 className="font-['Instrument_Serif',serif] text-[42px] font-normal leading-[1.1]">
            Help shape the next version.
          </h2>
          <p className="mt-5 text-[15px] leading-[1.65] text-[oklch(0.68_0.025_80)]">
            Tell us what worked, what broke, or what would make Mocki more useful before a real
            interview.
          </p>
        </div>

        {submitted ? (
          <div className="landing-process-stage p-8 sm:p-12">
            <h3 className="mb-2 text-2xl font-bold">Thanks for the feedback.</h3>
            <p className="text-[15px] leading-[1.65] text-[oklch(0.68_0.025_80)]">
              We read every response and use it to make Mocki better.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="landing-process-stage flex flex-col gap-7 p-8 sm:p-12"
          >
            <div>
              <h3 className="mb-2 text-2xl font-bold">Got feedback?</h3>
              <p className="text-[15px] leading-[1.65] text-[oklch(0.68_0.025_80)]">
                Short notes are perfect. Honest notes are even better.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[oklch(0.7_0.025_80)]">
                Overall rating
              </span>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="text-2xl transition-transform hover:scale-110"
                    style={{ opacity: rating && n > rating ? 0.3 : 1 }}
                  >
                    {rating && n <= rating ? "★" : "☆"}
                  </button>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[oklch(0.7_0.025_80)]">
                Your thoughts
              </span>
              <textarea
                className="landing-line-input"
                rows={3}
                placeholder="What did you like? What broke? What should we add?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[oklch(0.7_0.025_80)]">
                Email <span style={{ opacity: 0.5 }}>(optional — if you want a reply)</span>
              </span>
              <input
                className="landing-line-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <button
              type="submit"
              className="landing-primary-button w-full disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!rating || !message.trim() || loading}
            >
              {loading ? "Sending..." : "Send feedback"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
