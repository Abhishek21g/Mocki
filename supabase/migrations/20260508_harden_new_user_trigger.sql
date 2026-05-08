-- Harden the new-user trigger so a profile-insert failure never blocks signup.
-- Previously, any exception in handle_new_user() caused Supabase to roll back
-- the auth.users insert and return "Database error saving new user (reference: ...)"
-- to the client. Wrapping in EXCEPTION means the user is always created; their
-- profile row will be created on first use if it's missing.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email)
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Never block user creation due to a profile insert failure.
  -- The profile will be lazily created on first authenticated request.
  return new;
end;
$$;
