create table if not exists public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  felt_realistic int check (felt_realistic between 1 and 5),
  questions_relevant int check (questions_relevant between 1 and 5),
  report_useful int check (report_useful between 1 and 5),
  would_use_again boolean,
  free_text text,
  created_at timestamptz not null default now()
);

alter table public.session_feedback enable row level security;

create policy "Users read own feedback"
  on public.session_feedback
  for select
  using (auth.uid() = user_id);
