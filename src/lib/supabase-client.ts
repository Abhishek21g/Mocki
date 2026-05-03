import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/server/auth.functions";

let cachedClient: SupabaseClient | null = null;
let inFlight: Promise<SupabaseClient | null> | null = null;
let cachedConfig: { url: string; anonKey: string } | null = null;

/**
 * Lazily fetch Supabase config from the server (since we can't rely on Vite
 * VITE_* envs without changing dev tooling). Returns a cached browser client
 * on subsequent calls. Resolves to null if Supabase isn't configured.
 */
export async function getBrowserSupabase(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const config = await getPublicSupabaseConfig();
    if (!config) return null;
    cachedConfig = config;
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return cachedClient;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function getCachedSupabaseConfig(): { url: string; anonKey: string } | null {
  return cachedConfig;
}
