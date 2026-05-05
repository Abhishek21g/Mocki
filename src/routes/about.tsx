import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { HomeLogo } from "@/components/ghost/HomeLogo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Mocki" },
      { name: "description", content: "Meet the team behind Mocki, built at BeaverHacks 2026." },
    ],
  }),
  component: AboutPage,
});

const TEAM = [
  {
    name: "Abhishek Enaguthi",
    role: "Full Stack & AI Systems",
    linkedin: "https://www.linkedin.com/in/abhishekenaguthi/",
    initial: "A",
    color: "#76b900",
  },
  {
    name: "Muralikrishna Inti",
    role: "Backend & Infrastructure",
    linkedin: "https://www.linkedin.com/in/muralikinti/",
    initial: "M",
    color: "#4d7a00",
  },
  {
    name: "Mithun Karthikeyan",
    role: "Frontend & UX",
    linkedin: "https://www.linkedin.com/in/mithunkarth",
    initial: "M",
    color: "#76b900",
  },
  {
    name: "Ross Henderson",
    role: "AI & Voice Integration",
    linkedin: "https://www.linkedin.com/in/ross-henderson-9b0ba2257/",
    initial: "R",
    color: "#4d7a00",
  },
];

function AboutPage() {
  return (
    <div className="grid-bg min-h-screen">
      <div className="mx-auto max-w-3xl px-5 py-16">
        {/* Header */}
        <header className="mb-12 text-center fade-up">
          <Link to="/">
            <HomeLogo className="text-4xl font-extrabold tracking-tight md:text-5xl" />
          </Link>
          <div
            className="mt-3 inline-block rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: "rgba(118,185,0,0.4)",
              background: "rgba(118,185,0,0.08)",
              color: "var(--green)",
            }}
          >
            🏆 BeaverHacks 2026 — NVIDIA Track Winner
          </div>
          <p className="mt-4 text-base md:text-lg" style={{ color: "var(--text-2)" }}>
            Mocki is a multi-agent AI mock interview platform powered by NVIDIA Nemotron.
            Six specialized AI agents — Coordinator, Panel Generator, Interviewer, Clarifier,
            Evaluator, and Reporter — work together to simulate a real panel interview that
            adapts to your resume and target role in real time.
          </p>
        </header>

        {/* Team */}
        <section className="fade-up" style={{ animationDelay: "60ms" }}>
          <h2
            className="mono mb-6 text-[11px] uppercase tracking-wider"
            style={{ color: "var(--text-3)" }}
          >
            The Team
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {TEAM.map((member) => (
              <div
                key={member.name}
                className="gp-card p-5 flex flex-col gap-3"
                style={{ boxShadow: "0 0 20px rgba(118,185,0,0.04)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${member.color}, #2d4a00)`,
                      color: "#fff",
                    }}
                  >
                    {member.initial}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{member.name}</div>
                    <div className="text-xs" style={{ color: "var(--green)" }}>
                      {member.role}
                    </div>
                  </div>
                </div>
                <a
                  href={member.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium"
                  style={{ color: "var(--text-3)" }}
                >
                  LinkedIn →
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Built with */}
        <section className="mt-10 fade-up" style={{ animationDelay: "120ms" }}>
          <h2
            className="mono mb-4 text-[11px] uppercase tracking-wider"
            style={{ color: "var(--text-3)" }}
          >
            Built with
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              "NVIDIA Nemotron Nano 9B",
              "NVIDIA Magpie TTS",
              "NVIDIA Riva ASR",
              "TanStack Start",
              "Supabase",
              "Vercel",
              "Railway",
            ].map((tech) => (
              <span
                key={tech}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-2)",
                  background: "var(--surface2)",
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </section>

        {/* Feedback form */}
        <FeedbackForm />

        {/* Footer */}
        <footer className="mt-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
          <Link to="/" className="hover:text-white transition-colors">
            ← Back to Mocki
          </Link>
        </footer>
      </div>
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
      className="mt-10 fade-up rounded-2xl p-6"
      style={{
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        animationDelay: "180ms",
      }}
    >
      {submitted ? (
        <div className="text-center py-4">
          <div className="text-3xl mb-2">🙌</div>
          <h2 className="font-semibold mb-1">Thanks for the feedback!</h2>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            We read every response and use it to make Mocki better.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <h2 className="font-semibold mb-1">Got feedback?</h2>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              Tell us what's working, what's broken, or what you'd love next.
            </p>
          </div>

          {/* Star rating */}
          <div className="flex flex-col gap-1">
            <span className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
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
          </div>

          {/* Message */}
          <div className="flex flex-col gap-1">
            <span className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              Your thoughts
            </span>
            <textarea
              className="gp-input"
              rows={3}
              style={{ resize: "vertical" }}
              placeholder="What did you like? What broke? What should we add?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {/* Email (optional) */}
          <div className="flex flex-col gap-1">
            <span className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              Email <span style={{ opacity: 0.5 }}>(optional — if you want a reply)</span>
            </span>
            <input
              className="gp-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="gp-btn w-full"
            disabled={!rating || !message.trim() || loading}
          >
            {loading ? <><span className="gp-spinner" /> Sending…</> : "Send feedback →"}
          </button>
        </form>
      )}
    </section>
  );
}
