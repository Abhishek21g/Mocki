/**
 * Server-side analytics helper.
 *
 * Call trackEvent() from any server function — it is intentionally
 * fire-and-forget (never throws, never blocks the caller).
 *
 * Event catalogue:
 *   page_view           path, referrer
 *   sign_in_clicked     provider ("google" | "github" | "magic_link")
 *   sign_in_completed   provider, user_id
 *   resume_uploaded     file_size_kb
 *   interview_started   role, company, interview_type, total_rounds
 *   question_shown      session_id, round_number, stage, interviewer_id
 *   answer_submitted    session_id, round_number, score, stage
 *   interview_completed session_id, total_rounds, duration_ms
 *   interview_abandoned session_id, rounds_completed, last_stage
 *   report_viewed       session_id
 *   feedback_submitted  session_id, score, had_text
 */

import { createSupabaseAdminClient } from "./supabase.server";
import { createHash } from "node:crypto";

export type TrackEventOptions = {
  eventName: string;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  properties?: Record<string, unknown>;
  path?: string | null;
  /** Raw IP — will be hashed before storage */
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Write one analytics event. Never throws — failures are logged to stderr
 * only, so a broken analytics path never disrupts the actual feature.
 */
export async function trackEvent(opts: TrackEventOptions): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return; // local dev without Supabase — skip silently

  const ipHash = opts.ip
    ? createHash("sha256").update(opts.ip).digest("hex").slice(0, 16)
    : null;

  try {
    await supabase.from("analytics_events").insert({
      user_id: opts.userId ?? null,
      anonymous_id: opts.anonymousId ?? null,
      session_id: opts.sessionId ?? null,
      event_name: opts.eventName,
      properties: opts.properties ?? {},
      path: opts.path ?? null,
      ip_hash: ipHash,
      user_agent: opts.userAgent ?? null,
    });
  } catch (err) {
    console.error("[analytics] trackEvent failed:", err);
  }
}
