import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdminClient, getUserIdForToken } from "./supabase.server";
import { trackEvent } from "./analytics.server";

const FeedbackSchema = z.object({
  sessionId: z.string().min(1).max(100),
  accessToken: z.string().min(10).max(8000).optional(),
  felt_realistic: z.number().int().min(1).max(5).optional(),
  questions_relevant: z.number().int().min(1).max(5).optional(),
  report_useful: z.number().int().min(1).max(5).optional(),
  would_use_again: z.boolean().optional(),
  free_text: z.string().max(1000).optional(),
});

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FeedbackSchema.parse(d))
  .handler(async ({ data }) => {
    const admin = createSupabaseAdminClient();

    const userId = data.accessToken ? await getUserIdForToken(data.accessToken) : null;

    if (admin) {
      const { error } = await admin.from("session_feedback").insert({
        session_id: data.sessionId,
        user_id: userId ?? null,
        felt_realistic: data.felt_realistic ?? null,
        questions_relevant: data.questions_relevant ?? null,
        report_useful: data.report_useful ?? null,
        would_use_again: data.would_use_again ?? null,
        free_text: data.free_text?.trim() || null,
      });
      if (error) {
        console.error("[feedback] insert failed:", error.message);
      }
    }

    trackEvent({
      eventName: "feedback_submitted",
      userId,
      sessionId: data.sessionId,
      properties: {
        felt_realistic: data.felt_realistic,
        questions_relevant: data.questions_relevant,
        report_useful: data.report_useful,
        would_use_again: data.would_use_again,
        had_text: Boolean(data.free_text?.trim()),
      },
    }).catch(() => undefined);

    return { ok: true as const };
  });
