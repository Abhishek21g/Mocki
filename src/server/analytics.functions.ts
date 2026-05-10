/**
 * Client-callable server function for analytics events.
 *
 * The client never writes to Supabase directly — it calls this endpoint,
 * which runs server-side with the service-role key so events cannot be
 * spoofed or bypassed by RLS.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { trackEvent } from "./analytics.server";
import { getUserIdForToken } from "./supabase.server";
import { getRequest } from "@tanstack/react-start/server";

const LogEventSchema = z.object({
  eventName: z.string().min(1).max(80),
  anonymousId: z.string().max(64).optional(),
  sessionId: z.string().max(128).optional(),
  properties: z.record(z.unknown()).optional(),
  path: z.string().max(512).optional(),
  /** Access token — if present, resolves to a real user_id server-side */
  accessToken: z.string().max(8000).optional(),
});

export const logEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LogEventSchema.parse(d))
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      null;
    const userAgent = request?.headers.get("user-agent") ?? null;

    const userId = data.accessToken
      ? await getUserIdForToken(data.accessToken)
      : null;

    // fire-and-forget — never await so the client response is instant
    trackEvent({
      eventName: data.eventName,
      userId,
      anonymousId: data.anonymousId,
      sessionId: data.sessionId,
      properties: data.properties as Record<string, unknown> | undefined,
      path: data.path,
      ip,
      userAgent,
    }).catch(() => undefined);

    return { ok: true };
  });
