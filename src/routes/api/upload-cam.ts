import { createFileRoute } from "@tanstack/react-router";

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

          // Inline auth: verify token via Supabase
          const supabaseUrl = process.env.SUPABASE_URL?.trim();
          const supabaseKey = process.env.SUPABASE_SERVICE_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim();
          if (!supabaseUrl || !supabaseKey) {
            return new Response(JSON.stringify({ ok: false, error: "Server config error" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
          if (authErr || !user?.id) {
            return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          }
          const userId = user.id;

          // Inline upload: send to DO Spaces
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

          const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
          const s3 = new S3Client({
            endpoint: spacesEndpoint,
            region: spacesRegion,
            credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
            forcePathStyle: false,
            requestChecksumCalculation: "when_required" as never,
            responseChecksumValidation: "when_required" as never,
          });

          const ext = file.type.includes("mp4") ? "mp4" : "webm";
          const key = `sessions/${userId}/${sessionId}/cam.${ext}`;
          const buffer = Buffer.from(await file.arrayBuffer());

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
