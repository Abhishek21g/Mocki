-- Track admin-triggered outreach so we do not accidentally send the same
-- invite/check-in again without noticing.

create table if not exists public.email_outreach_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  kind text not null check (kind in ('check_in', 'invite')),
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_by text,
  created_at timestamptz not null default now()
);

create index if not exists email_outreach_log_email_kind_idx
  on public.email_outreach_log (lower(email), kind, created_at desc);

create index if not exists email_outreach_log_user_kind_idx
  on public.email_outreach_log (user_id, kind, created_at desc);

alter table public.email_outreach_log enable row level security;

drop policy if exists "Outreach log is service-role only" on public.email_outreach_log;
create policy "Outreach log is service-role only"
  on public.email_outreach_log for all
  using (false)
  with check (false);
