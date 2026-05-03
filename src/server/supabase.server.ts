import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase helpers.
 *
 * The anon URL + key are read from process.env (loaded from .dev.vars in dev,
 * Cloudflare Workers secrets in production). For RLS to work we forward the
 * caller's access token; PostgREST then enforces policies as that user.
 */

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabaseConfig(): { url: string; anonKey: string } {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .dev.vars (see supabase/README.md).",
    );
  }
  return config;
}

export function createServerClientForUser(accessToken: string | null): SupabaseClient {
  const { url, anonKey } = requireSupabaseConfig();
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

/**
 * Resolve the user id for a given access token. Returns null if there is no
 * token or the token is not valid; callers decide whether that is fatal.
 */
export async function getUserIdForToken(accessToken: string | null): Promise<string | null> {
  if (!accessToken) return null;
  const config = getSupabaseConfig();
  if (!config) return null;
  const client = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user.id;
}
