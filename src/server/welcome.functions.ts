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
      console.log("[welcome] maybeSendWelcomeEmail called");

      const userId = await getUserIdForToken(data.accessToken);
      if (!userId) {
        console.log("[welcome] no userId from token");
        return { sent: false };
      }
      console.log("[welcome] userId:", userId);

      const admin = createSupabaseAdminClient();
      if (!admin) {
        console.log("[welcome] no admin client");
        return { sent: false };
      }

      const { data: userData, error } = await admin.auth.admin.getUserById(userId);
      if (error || !userData?.user) {
        console.log("[welcome] getUserById failed:", error?.message);
        return { sent: false };
      }

      const user = userData.user;
      const createdAt = new Date(user.created_at).getTime();
      const ageMs = Date.now() - createdAt;
      console.log("[welcome] account age ms:", ageMs);

      // Only send if the account is less than 5 minutes old (new signup)
      if (ageMs > 5 * 60 * 1000) {
        console.log("[welcome] account too old, skipping");
        return { sent: false };
      }

      const email = user.email;
      if (!email) {
        console.log("[welcome] no email on user");
        return { sent: false };
      }

      const name =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        email.split("@")[0];

      console.log("[welcome] sending to:", email);
      await sendWelcomeEmail(email, name);
      console.log("[welcome] sent successfully");
      return { sent: true };
    } catch (err) {
      console.error("[welcome] Error:", err);
      return { sent: false };
    }
  });
