import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getUserIdForToken } from "./supabase.server";
import { createSupabaseAdminClient } from "./supabase.server";
import { sendWelcomeEmail } from "./email.server";

const Schema = z.object({ accessToken: z.string().min(10).max(8000) });

export const maybeSendWelcomeEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserIdForToken(data.accessToken);
      if (!userId) return { sent: false };

      const admin = createSupabaseAdminClient();
      if (!admin) return { sent: false };

      const { data: userData, error } = await admin.auth.admin.getUserById(userId);
      if (error || !userData?.user) return { sent: false };

      const user = userData.user;
      const ageMs = Date.now() - new Date(user.created_at).getTime();
      if (ageMs > 5 * 60 * 1000) return { sent: false };

      const email = user.email;
      if (!email) return { sent: false };

      const name =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        email.split("@")[0];

      await sendWelcomeEmail(email, name);
      return { sent: true };
    } catch {
      return { sent: false };
    }
  });
