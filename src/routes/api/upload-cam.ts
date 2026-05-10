import { createFileRoute } from "@tanstack/react-router";
import { getUserIdForToken, createSupabaseAdminClient } from "@/server/supabase.server";
import { uploadToSpaces, slugify } from "@/server/spaces.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = (createFileRoute as any)("/api/upload-cam")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const formData = await request.formData();
          const file = formData.get("file") as File | null;
          const accessToken = formData.get("accessToken") as string | null;
          const sessionId = formData.get("sessionId") as string | null;

          if (!file || !accessToken || !sessionId) {
            return new Response(JSON.stringify({ ok: false, error: "Missing fields" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }

          const userId = await getUserIdForToken(accessToken);
          if (!userId) {
            return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          }

          const ext = file.type.includes("mp4") ? "mp4" : "webm";
          let key = `sessions/${userId}/${sessionId}/cam.${ext}`;

          try {
            const admin = createSupabaseAdminClient();
            if (admin) {
              const [sessionRes, userRes] = await Promise.all([
                admin
                  .from("session_store")
                  .select("data, created_at")
                  .eq("id", sessionId)
                  .eq("user_id", userId)
                  .single(),
                admin.auth.admin.getUserById(userId),
              ]);
              const d = sessionRes.data?.data as Record<string, unknown> | null;
              if (d) {
                const role = (d.role as string) || "unknown";
                const createdAt = (sessionRes.data?.created_at as string) ?? new Date().toISOString();
                const authUser = userRes.data?.user;
                const displayName =
                  (authUser?.user_metadata?.full_name as string | undefined) ||
                  (authUser?.user_metadata?.name as string | undefined) ||
                  authUser?.email?.split("@")[0] ||
                  "guest";
                const date = createdAt.slice(0, 10);
                const userSlug = `${slugify(displayName)}__${userId.slice(0, 8)}`;
                const roleSlug = `${slugify(role)}__${sessionId.slice(0, 8)}`;
                key = `sessions/${date}/${userSlug}/${roleSlug}/cam.${ext}`;
              }
            }
          } catch {
            // fall back to old key format
          }

          const buffer = Buffer.from(await file.arrayBuffer());
          const stored = await uploadToSpaces(key, buffer, file.type);

          console.log("[upload-cam]", stored ? "ok" : "failed", key, `${buffer.byteLength}b`);
          return new Response(JSON.stringify({ ok: !!stored }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          console.error("[upload-cam] error", err);
          return new Response(JSON.stringify({ ok: false }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
