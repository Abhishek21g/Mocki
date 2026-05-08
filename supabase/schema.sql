-- Mocki — Supabase schema for per-user history and learner memory
--
-- Run this in the Supabase SQL editor for a fresh project. Safe to re-run:
-- everything is wrapped in IF NOT EXISTS / OR REPLACE.

-- =============================================================================
-- profiles: one row per auth.users user, holds rolling "learner memory" used to
-- bias future interviews.
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  learner_memory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- interview_sessions: one row per completed interview; payload holds the full
-- session export (rounds + final report) so we can rebuild the report UI.
-- =============================================================================
create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  role text,
  company text,
  interview_type text,
  overall_score numeric(3, 1),
  hire_decision text,
  metadata jsonb not null default '{}'::jsonb,
  payload jsonb not null
);

create index if not exists interview_sessions_user_idx
  on public.interview_sessions (user_id, created_at desc);

-- =============================================================================
-- email_outreach_log: admin-triggered check-ins/invites, used to prevent
-- accidental repeat sends and to audit deliverability errors.
-- =============================================================================
create table if not exists public.email_outreach_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  kind text not null check (kind in ('check_in', 'invite')),
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_by text,
  provider_message_id text,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  failed_at timestamptz,
  last_event_at timestamptz,
  last_event_type text,
  last_click_url text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_outreach_log_email_kind_idx
  on public.email_outreach_log (lower(email), kind, created_at desc);

create index if not exists email_outreach_log_user_kind_idx
  on public.email_outreach_log (user_id, kind, created_at desc);

create index if not exists email_outreach_log_provider_message_idx
  on public.email_outreach_log (provider_message_id);

-- =============================================================================
-- Row Level Security: each user only sees their own rows.
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.email_outreach_log enable row level security;

drop policy if exists "Profiles are self-readable" on public.profiles;
create policy "Profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles are self-writable" on public.profiles;
create policy "Profiles are self-writable"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Profiles are self-updatable" on public.profiles;
create policy "Profiles are self-updatable"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Sessions are self-readable" on public.interview_sessions;
create policy "Sessions are self-readable"
  on public.interview_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Sessions are self-writable" on public.interview_sessions;
create policy "Sessions are self-writable"
  on public.interview_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Sessions are self-deletable" on public.interview_sessions;
create policy "Sessions are self-deletable"
  on public.interview_sessions for delete
  using (auth.uid() = user_id);

drop policy if exists "Outreach log is service-role only" on public.email_outreach_log;
create policy "Outreach log is service-role only"
  on public.email_outreach_log for all
  using (false)
  with check (false);

-- =============================================================================
-- Auto-create a profile row when a new auth.users record is created.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Keep updated_at fresh on profile updates.
-- =============================================================================
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();
