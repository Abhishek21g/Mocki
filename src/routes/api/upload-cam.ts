import { createFileRoute } from "@tanstack/react-router";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

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

          const supabaseUrl = process.env.SUPABASE_URL?.trim();
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim();
          if (!supabaseUrl || !supabaseKey) {
            return new Response(JSON.stringify({ ok: false, error: "Server config error" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }

          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
          });

          const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
          if (authErr || !user?.id) {
            return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          }
          const userId = user.id;

          const spacesKey = process.env.DO_SPACES_KEY?.trim();
          const spacesSecret = process.env.DO_SPACES_SECRET?.trim();
          const spacesEndpoint = process.env.DO_SPACES_ENDPOINT?.trim();
          const spacesRegion = process.env.DO_SPACES_REGION?.trim() ?? "sfo3";
          const spacesBucket = process.env.DO_SPACES_BUCKET?.trim() ?? "mocki-data";

          if (!spacesKey || !spacesSecret || !spacesEndpoint) {
            console.warn("[upload-cam] DO_SPACES credentials not set");
            return new Response(JSON.stringify({ ok: false, error: "Storage not configured" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }

          const ext = file.type.includes("mp4") ? "mp4" : "webm";
          let key = `sessions/${userId}/${sessionId}/cam.${ext}`;

          try {
            const adminClient = createClient(supabaseUrl, supabaseKey, {
              auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
            });
            const [sessionRes, userRes] = await Promise.all([
              adminClient
                .from("session_store")
                .select("data, created_at")
                .eq("id", sessionId)
                .eq("user_id", userId)
                .single(),
              adminClient.auth.admin.getUserById(userId),
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
          } catch {
            // fall back to old key format
          }

          const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
          const s3 = new S3Client({
            endpoint: spacesEndpoint,
            region: spacesRegion,
            credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
            forcePathStyle: false,
            requestChecksumCalculation: "when_required" as never,
            responseChecksumValidation: "when_required" as never,
          });

          const buffer = Buffer.from(await file.arrayBuffer());
          try {
            await s3.send(new PutObjectCommand({
              Bucket: spacesBucket,
              Key: key,
              Body: buffer,
              ContentType: file.type,
            }));
            console.log("[upload-cam] ok", key, `${buffer.byteLength}b`);
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "content-type": "application/json" },
            });
          } catch (uploadErr) {
            console.error("[upload-cam] upload failed", uploadErr);
            return new Response(JSON.stringify({ ok: false }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
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
