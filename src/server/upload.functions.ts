import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { uploadToSpaces, getPresignedPutUrl } from "./spaces.server";
import { getUserIdForToken } from "./supabase.server";

const UploadResumeSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  fileName: z.string().max(200),
  fileBase64: z.string().max(10_000_000), // ~7MB after base64
  sessionId: z.string().min(8).max(80),
});

const UploadDataSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  sessionId: z.string().min(8).max(80),
  type: z.enum(["keystrokes", "session_meta"]),
  payload: z.string().max(5_000_000),
});

export const uploadResumePdf = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UploadResumeSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { ok: false as const };

    const buffer = Buffer.from(data.fileBase64, "base64");
    const key = `resumes/${userId}/${data.sessionId}/${data.fileName}`;
    const stored = await uploadToSpaces(key, buffer, "application/pdf");
    return { ok: !!stored, key: stored ?? undefined };
  });

const GetUploadUrlSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  sessionId: z.string().min(8).max(80),
  type: z.enum(["cam"]),
  mimeType: z.string().max(100),
});

export const getUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GetUploadUrlSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { ok: false as const, url: null };
    const ext = data.mimeType.includes("mp4") ? "mp4" : "webm";
    const key = `sessions/${userId}/${data.sessionId}/cam.${ext}`;
    const url = await getPresignedPutUrl(key, data.mimeType);
    return { ok: !!url, url };
  });

export const uploadSessionData = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UploadDataSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { ok: false as const };

    const key = `sessions/${userId}/${data.sessionId}/${data.type}.json`;
    const stored = await uploadToSpaces(key, data.payload, "application/json");
    return { ok: !!stored };
  });
