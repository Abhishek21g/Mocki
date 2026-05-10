-- Product funnel analytics events.
-- Every meaningful user action (page view, sign-in click, interview start,
-- answer submitted, etc.) is written here so admin can query the full funnel.
-- Intentionally simple: no foreign-key constraints so we never lose an event
-- because a user/session row doesn't exist yet.

create table if not exists public.analytics_events (
  id            uuid primary key default gen_random_uuid(),
  -- null for logged-out / pre-sign-in events
  user_id       uuid references auth.users(id) on delete set null,
  -- stable browser fingerprint stored in localStorage; bridges pre/post sign-in
  anonymous_id  text,
  -- the session being interviewed in (null for non-interview events)
  session_id    text,
  event_name    text not null,
  -- arbitrary key/value payload (role, company, question number, etc.)
  properties    jsonb not null default '{}'::jsonb,
  -- page path at time of event
  path          text,
  -- hashed IP — privacy-safe, still useful for rough geo/dedup
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

-- Indexes that support the admin funnel queries
create index if not exists analytics_events_user_id_idx    on public.analytics_events (user_id);
create index if not exists analytics_events_session_id_idx on public.analytics_events (session_id);
create index if not exists analytics_events_event_name_idx on public.analytics_events (event_name);
create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_anon_id_idx    on public.analytics_events (anonymous_id);

-- RLS: users can read only their own events; service role can read all.
alter table public.analytics_events enable row level security;

create policy "Users read own events"
  on public.analytics_events for select
  using (auth.uid() = user_id);

-- No client-side insert policy — all writes go through the service-role key
-- on the server, so clients cannot spoof events.
