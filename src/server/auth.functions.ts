import { createServerFn } from "@tanstack/react-start";
import { getSupabaseConfig } from "./supabase.server";

/**
 * Returns the public Supabase URL + anon key so the browser client can boot
 * without depending on Vite VITE_* env wiring. Returns null when Supabase is
 * not configured so the UI can degrade gracefully.
 */
export const getPublicSupabaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  const config = getSupabaseConfig();
  if (!config) return null;
  return { url: config.url, anonKey: config.anonKey };
});
