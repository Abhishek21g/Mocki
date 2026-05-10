create table if not exists public.session_integrity (
  session_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  account_email text,
  resume_candidate_name text,
  resume_candidate_email text,
  name_mismatch boolean default false,
  email_mismatch boolean default false,
  paste_heavy boolean default false,
  no_camera boolean default false,
  tab_switches int default 0,
  integrity_flags text[] default '{}',
  created_at timestamptz not null default now()
);

alter table public.session_integrity enable row level security;
