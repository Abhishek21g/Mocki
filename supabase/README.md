# Supabase setup for Mocki

This directory holds the SQL needed to set up the per-user history and learner-memory features.

## 1. Create a Supabase project

1. Go to <https://supabase.com> and create a new project.
2. Note your **Project URL** and **anon public key** (Settings → API).
3. (Optional, server-only) Note your **service role key** if you want admin-level operations on the server (this project uses RLS + the user JWT instead, so the service role key is not required).

## 2. Apply the schema

Open the SQL editor in the Supabase dashboard and run the contents of [`schema.sql`](./schema.sql). It is idempotent; safe to re-run.

The script creates:

- `public.profiles` — one row per `auth.users` row, with a `learner_memory` JSON blob.
- `public.interview_sessions` — one row per completed mock interview.
- Row Level Security policies so each user only ever reads/writes their own rows.
- Trigger to auto-create a profile row on sign up.

## 3. Enable Google OAuth

1. Supabase Dashboard → Authentication → Providers → Google → enable.
2. Create OAuth credentials in Google Cloud Console (Web application). Authorized redirect URI:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Save the **Client ID** and **Client Secret** in Supabase.
4. Authentication → URL Configuration → Site URL: set to your app URL.
   - Local dev: `http://localhost:8080`
   - Production: your deployed origin
5. Add redirect URLs:
   - `http://localhost:8080/auth/callback`
   - `https://<your-prod-domain>/auth/callback`

## 4. Local environment variables

Add to `.dev.vars` (already gitignored):

```dotenv
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
```

Restart the dev server after editing.

## 5. Production

For Cloudflare Workers deploys, set the same variables as **secrets** via `wrangler secret put SUPABASE_URL` / `SUPABASE_ANON_KEY` (or in the Cloudflare dashboard). Never commit secrets to git.
