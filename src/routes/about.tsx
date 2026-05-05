import { createFileRoute, Link } from "@tanstack/react-router";
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
    name: "Abhishek Enagutha",
    handle: "Abhishek21g",
    role: "Full Stack & AI Systems",
    bio: "Built the multi-agent interview pipeline and NVIDIA integration.",
    linkedin: "https://www.linkedin.com/in/abhishek-enagutha",
    initial: "A",
  },
  {
    name: "Muralikrishna Inti",
    handle: "murali",
    role: "Backend & Infrastructure",
    bio: "Architected session persistence, deployment pipeline, and backend reliability.",
    linkedin: "https://www.linkedin.com/in/muralikrishna-inti",
    initial: "M",
  },
  {
    name: "Mithun Karthikeyan",
    handle: "mithunkar",
    role: "Frontend & UX",
    bio: "Designed the interview experience and built the real-time evaluation UI.",
    linkedin: "https://www.linkedin.com/in/mithun-karthikeyan",
    initial: "M",
  },
  {
    name: "Ross Henderson",
    handle: "hendaros",
    role: "AI & Voice Integration",
    bio: "Integrated NVIDIA Magpie TTS, ASR pipeline, and avatar research.",
    linkedin: "https://www.linkedin.com/in/ross-henderson",
    initial: "R",
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
                      background: "linear-gradient(135deg, var(--green), #4d7a00)",
                      color: "#000",
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
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
                  {member.bio}
                </p>
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

        {/* Feedback */}
        <section
          className="mt-10 fade-up rounded-2xl p-6 text-center"
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            animationDelay: "180ms",
          }}
        >
          <h2 className="font-semibold mb-1">Got feedback?</h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-2)" }}>
            We read every response. Tell us what's working, what's broken, or what you'd love to see next.
          </p>
          <a
            href="https://forms.gle/YOUR_FORM_ID"
            target="_blank"
            rel="noopener noreferrer"
            className="gp-btn inline-flex px-6"
          >
            Share feedback →
          </a>
        </section>

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
