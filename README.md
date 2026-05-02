# Mockpilot

Multi-agent AI mock interview platform powered by NVIDIA Nemotron.

Mockpilot runs a coordinated pipeline of specialized agents — a Coordinator that
plans the interview flow, a Persona generator, an Interviewer, a Clarifier that
detects vague answers and asks follow-ups, an Evaluator that scores each
response, and a Reporter that produces the final assessment. A live agent
activity panel surfaces every agent's reasoning, decisions, and token usage in
real time.

## Stack

- **TanStack Start** (React 19, file-based routing, server functions)
- **Vite 7** + **Tailwind CSS v4**
- **NVIDIA Nemotron** (`nvidia-nemotron-nano-9b-v2`) via the NIM API
- **Cloudflare Workers** runtime for production SSR

## Getting started

```bash
bun install
echo "NVIDIA_API_KEY=your_key_here" > .dev.vars
bun dev
```

Open http://localhost:8080.

## Scripts

- `bun dev` — start the dev server
- `bun run build` — production build
- `bun run preview` — preview the production build
- `bun run lint` — lint the project

## Project layout

```
src/
  routes/           # File-based routes (TanStack Router)
  server/           # Server functions and agent pipeline
    agents.server.ts        # Coordinator, Interviewer, Clarifier, Evaluator, Reporter
    interview.functions.ts  # Orchestration entrypoints
    nim.server.ts           # Nemotron client
    agent-log.server.ts     # Per-session activity log
  components/       # UI components
  lib/              # Client store and utilities
```

## License

MIT
