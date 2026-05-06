import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdminClient } from "./supabase.server";
import type { InterviewSessionPayload } from "./history.server";

const Schema = z.object({ sessionId: z.string().min(8).max(80) });

/**
 * Fetch a report without requiring authentication — used for public share links.
 * Session IDs are UUIDs so they are effectively private unless the user shares the link.
 * Uses the admin client to bypass RLS.
 */
export const fetchPublicReport = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data }) => {
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return { ok: false as const, reason: "unavailable" as const, payload: null };
    }
    const { data: row, error } = await admin
      .from("interview_sessions")
      .select("payload, role, company, overall_score, hire_decision")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error || !row) {
      return { ok: false as const, reason: "not_found" as const, payload: null };
    }
    return { ok: true as const, payload: row.payload as InterviewSessionPayload };
  });
