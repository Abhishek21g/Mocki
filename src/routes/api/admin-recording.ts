import { createFileRoute } from "@tanstack/react-router";

const ADMIN_EMAILS = ["enaguthiabhishek@gmail.com", "muralikinti@gmail.com"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = (createFileRoute as any)("/api/admin-recording")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const accessToken = url.searchParams.get("accessToken");
        const userId = url.searchParams.get("userId");
        const sessionId = url.searchParams.get("sessionId");
        const ext = url.searchParams.get("ext") === "mp4" ? "mp4" : "webm";

        if (!accessToken || !userId || !sessionId) {
          return new Response("missing fields", { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL?.trim();
        const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!supabaseUrl || !anonKey || !serviceKey) return new Response("not configured", { status: 500 });

        const { createClient } = await import("@supabase/supabase-js");
        const authClient = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
        const adminUserId = authData?.user?.id;
        if (authError || !adminUserId) return new Response("unauthorized", { status: 401 });

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data } = await admin.auth.admin.getUserById(adminUserId);
        const email = data?.user?.email ?? "";
        if (!ADMIN_EMAILS.includes(email)) return new Response("unauthorized", { status: 401 });

        const key = `sessions/${userId}/${sessionId}/cam.${ext}`;
        const signedUrl = await getSignedSpacesUrl(key);
        if (!signedUrl) return new Response("recording unavailable", { status: 404 });

        const headers: HeadersInit = {};
        const range = request.headers.get("range");
        if (range) headers.Range = range;

        const upstream = await fetch(signedUrl, { headers });
        if (!upstream.ok) return new Response("recording not found", { status: upstream.status });

        const responseHeaders = new Headers(upstream.headers);
        responseHeaders.set("content-type", ext === "mp4" ? "video/mp4" : "video/webm");
        responseHeaders.set("accept-ranges", "bytes");
        responseHeaders.set("cache-control", "private, max-age=300");
        responseHeaders.delete("access-control-allow-origin");

        return new Response(upstream.body, {
          status: upstream.status,
          headers: responseHeaders,
        });
      },
    },
  },
});

async function getSignedSpacesUrl(key: string): Promise<string | null> {
  const spacesKey = process.env.DO_SPACES_KEY?.trim();
  const spacesSecret = process.env.DO_SPACES_SECRET?.trim();
  const spacesEndpoint = process.env.DO_SPACES_ENDPOINT?.trim();
  const spacesRegion = process.env.DO_SPACES_REGION?.trim() ?? "sfo3";
  const spacesBucket = process.env.DO_SPACES_BUCKET?.trim() ?? "mocki-data";
  if (!spacesKey || !spacesSecret || !spacesEndpoint) return null;

  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = new S3Client({
    endpoint: spacesEndpoint,
    region: spacesRegion,
    credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
    forcePathStyle: false,
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  });
  return getSignedUrl(client, new GetObjectCommand({ Bucket: spacesBucket, Key: key }), {
    expiresIn: 300,
  });
}
