/**
 * useTrack — thin client hook for firing analytics events.
 *
 * Usage:
 *   const track = useTrack();
 *   track("sign_in_clicked", { provider: "google" });
 *
 * - Reads the anonymous_id from localStorage (creates one on first call).
 * - Attaches the current page path automatically.
 * - Sends the access token if the user is signed in so the event is linked
 *   to a real user_id server-side.
 * - Never throws — failures are swallowed silently.
 */

import { useCallback } from "react";
import { useSupabaseAuth } from "./supabase-context";
import { logEvent } from "@/server/analytics.functions";

const ANON_KEY = "mocki:anon_id";

function getOrCreateAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function useTrack() {
  const { getAccessToken } = useSupabaseAuth();

  return useCallback(
    async (eventName: string, properties?: Record<string, unknown>) => {
      try {
        const accessToken = getAccessToken();
        const anonymousId = getOrCreateAnonId();
        const path =
          typeof window !== "undefined" ? window.location.pathname : undefined;

        await logEvent({
          data: {
            eventName,
            anonymousId,
            properties,
            path,
            ...(accessToken ? { accessToken } : {}),
          },
        });
      } catch {
        // never surface analytics errors to the user
      }
    },
    [getAccessToken],
  );
}
