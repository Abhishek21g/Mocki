-- Active interview session store.
-- Replaces the in-memory globalThis Map so sessions survive serverless cold
-- starts on Vercel / Cloudflare (where each invocation gets a fresh process).
--
-- Distinct from public.interview_sessions, which stores completed interview
-- report payloads for the history UI. This table holds the ephemeral in-flight
-- state while an interview is running.

create table if not exists public.session_store (
  id         text        primary key,
  data       jsonb       not null,
  created_at timestamptz not null default now(),
  user_id    text
);

-- RLS is enabled but no policies are defined: only the service-role key
-- (used server-side, never exposed to clients) can access this table.
alter table public.session_store enable row level security;
