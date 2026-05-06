import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getUserIdForToken, createSupabaseAdminClient } from "./supabase.server";
import {
  getOrCreateProfile,
  createStripeCheckoutSession,
} from "./billing.server";

export const getUserProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10).max(8000) }).parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { interviews_used: 0, is_pro: false };
    const profile = await getOrCreateProfile(userId);
    return { interviews_used: profile.interviews_used, is_pro: profile.is_pro };
  });

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      accessToken: z.string().min(10).max(8000),
      returnUrl: z.string().url().max(500),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { url: null };

    const admin = createSupabaseAdminClient();
    let email: string | undefined;
    if (admin) {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      email = userData?.user?.email ?? undefined;
    }

    const url = await createStripeCheckoutSession(userId, email, data.returnUrl);
    return { url };
  });
