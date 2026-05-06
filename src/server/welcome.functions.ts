import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getUserIdForToken } from "./supabase.server";
import { createSupabaseAdminClient } from "./supabase.server";
import { sendWelcomeEmail } from "./email.server";

const Schema = z.object({ accessToken: z.string().min(10).max(8000) });

/**
 * Called from the auth callback after every sign-in.
 * Sends a welcome email only if the account was created within the last
 * 2 minutes — i.e. this is a brand-new signup, not a returning user.
 */
export const maybeSendWelcomeEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserIdForToken(data.accessToken);
      if (!userId) return { sent: false };

      const admin = createSupabaseAdminClient();
      if (!admin) return { sent: false };

      // Fetch the user record to get email, name, and created_at
      const { data: userData, error } = await admin.auth.admin.getUserById(userId);
      if (error || !userData?.user) return { sent: false };

      const user = userData.user;
      const createdAt = new Date(user.created_at).getTime();
      const ageMs = Date.now() - createdAt;

      // Only send if the account is less than 2 minutes old (new signup)
      if (ageMs > 2 * 60 * 1000) return { sent: false };

      const email = user.email;
      if (!email) return { sent: false };

      const name =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        email.split("@")[0];

      await sendWelcomeEmail(email, name);
      return { sent: true };
    } catch (err) {
      // Never block the user — email sending is best-effort
      console.error("[welcome] Error:", err);
      return { sent: false };
    }
  });
