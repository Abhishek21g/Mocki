import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { uploadToSpaces, getPresignedPutUrl, getPresignedGetUrl, objectExists, slugify, uploadMetadata } from "./spaces.server";
import { getUserIdForToken, createSupabaseAdminClient } from "./supabase.server";
import { extractResumeSignals } from "./resume-signals.server";
import { saveIntegrityRecord } from "./integrity.functions";

type SessionBase = {
  newBase: string;
  userEmail: string;
  displayName: string;
  role: string;
  company: string;
  interviewType: string;
  totalRounds: number;
  currentRound: number;
  createdAt: string;
  resume: string;
};

async function resolveSessionBase(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  sessionId: string,
): Promise<SessionBase | null> {
  if (!admin) return null;
  try {
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
    if (!d) return null;

    const role = (d.role as string) || "unknown";
    const company = (d.company as string) || "unknown";
    const interviewType = (d.interview_type as string) || "mixed";
    const totalRounds = (d.totalRounds as number) ?? 1;
    const currentRound = (d.currentRound as number) ?? 0;
    const createdAt = (sessionRes.data?.created_at as string) ?? new Date().toISOString();
    const resume = (d.resume as string) || "";

    const authUser = userRes.data?.user;
    const displayName =
      (authUser?.user_metadata?.full_name as string | undefined) ||
      (authUser?.user_metadata?.name as string | undefined) ||
      authUser?.email?.split("@")[0] ||
      "guest";
    const userEmail = authUser?.email ?? "";

    const date = createdAt.slice(0, 10);
    const userSlug = `${slugify(displayName)}__${userId.slice(0, 8)}`;
    const roleSlug = `${slugify(role)}__${sessionId.slice(0, 8)}`;
    const newBase = `sessions/${date}/${userSlug}/${roleSlug}`;

    return { newBase, userEmail, displayName, role, company, interviewType, totalRounds, currentRound, createdAt, resume };
  } catch {
    return null;
  }
}

const UploadResumeSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  fileName: z.string().max(200),
  fileBase64: z.string().max(10_000_000), // ~7MB after base64
  sessionId: z.string().min(8).max(80),
});

const UploadDataSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  sessionId: z.string().min(8).max(80),
  type: z.enum(["keystrokes", "session_meta", "behavioral"]),
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

const GetRecordingUrlSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  sessionId: z.string().min(8).max(80),
});

export const getSessionRecordingUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GetRecordingUrlSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { ok: false as const, url: null, ext: null };

    const tryKeys = async (
      webm: string,
      mp4: string,
    ): Promise<{ key: string; ext: "webm" | "mp4" } | null> => {
      if (await objectExists(webm)) return { key: webm, ext: "webm" };
      if (await objectExists(mp4)) return { key: mp4, ext: "mp4" };
      return null;
    };

    const admin = createSupabaseAdminClient();
    const base = await resolveSessionBase(admin, userId, data.sessionId);

    let found: { key: string; ext: "webm" | "mp4" } | null = null;

    if (base) {
      found = await tryKeys(`${base.newBase}/cam.webm`, `${base.newBase}/cam.mp4`);
    }

    if (!found) {
      found = await tryKeys(
        `sessions/${userId}/${data.sessionId}/cam.webm`,
        `sessions/${userId}/${data.sessionId}/cam.mp4`,
      );
    }

    if (!found) return { ok: true, url: null, ext: null };

    const url = await getPresignedGetUrl(found.key, 3600);
    return { ok: true, url, ext: found.ext };
  });

export const uploadSessionData = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UploadDataSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) {
      console.warn("[upload] uploadSessionData: no userId from token");
      return { ok: false as const };
    }

    const admin = createSupabaseAdminClient();
    const base = await resolveSessionBase(admin, userId, data.sessionId);

    const key = base
      ? `${base.newBase}/${data.type}.json`
      : `sessions/${userId}/${data.sessionId}/${data.type}.json`;

    const stored = await uploadToSpaces(key, data.payload, "application/json");
    console.log("[upload] uploadSessionData:", stored ? "ok" : "failed", key);
    return { ok: !!stored };
  });

const SessionMetadataSchema = z.object({
  accessToken: z.string().min(10).max(8000),
  sessionId: z.string().min(8).max(80),
  browser: z.string().max(500).optional(),
  paste_count: z.number().int().nonnegative().optional(),
  tab_switches: z.number().int().nonnegative().optional(),
  camera_consent: z.boolean().optional(),
});

export const uploadSessionMetadata = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SessionMetadataSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) return { ok: false as const };

    const admin = createSupabaseAdminClient();
    const base = await resolveSessionBase(admin, userId, data.sessionId);
    if (!base) return { ok: false as const };

    // --- Integrity signals ---
    const signals = extractResumeSignals(base.resume);

    const accountEmail = base.userEmail || null;
    const accountName = base.displayName !== "guest" ? base.displayName : null;

    const nameMismatch = (() => {
      if (!signals.candidate_name || !accountName) return false;
      const resumeWords = signals.candidate_name.toLowerCase().split(/\s+/);
      const accountWords = accountName.toLowerCase().split(/\s+/);
      return !resumeWords.some((w) => accountWords.includes(w));
    })();

    const emailMismatch = !!(
      signals.candidate_email &&
      accountEmail &&
      signals.candidate_email.toLowerCase() !== accountEmail.toLowerCase()
    );

    const pasteCount = data.paste_count ?? 0;
    const tabSwitches = data.tab_switches ?? 0;
    const pasteHeavy = pasteCount > 3;
    const noCamera = data.camera_consent === false;

    const integrityFlags: string[] = [];
    if (nameMismatch) integrityFlags.push("name_mismatch");
    if (emailMismatch) integrityFlags.push("email_mismatch");
    if (pasteHeavy) integrityFlags.push("paste_heavy");
    if (noCamera) integrityFlags.push("no_camera");

    const metadata: Record<string, unknown> = {
      sessionId: data.sessionId,
      userId,
      userEmail: accountEmail,
      displayName: base.displayName,
      role: base.role,
      company: base.company,
      interviewType: base.interviewType,
      totalRounds: base.totalRounds,
      completionStatus: base.currentRound >= base.totalRounds ? "completed" : "abandoned",
      createdAt: base.createdAt,
      uploadedAt: new Date().toISOString(),
      browser: data.browser ?? null,
      // Integrity fields
      resume_candidate_name: signals.candidate_name,
      resume_candidate_email: signals.candidate_email,
      account_email: accountEmail,
      name_mismatch: nameMismatch,
      email_mismatch: emailMismatch,
      paste_heavy: pasteHeavy,
      no_camera: noCamera,
      paste_count: pasteCount,
      tab_switches: tabSwitches,
      integrity_flags: integrityFlags,
    };

    await uploadMetadata(base.newBase, metadata);

    // Fire-and-forget: persist to DB
    saveIntegrityRecord({
      session_id: data.sessionId,
      user_id: userId,
      account_email: accountEmail,
      resume_candidate_name: signals.candidate_name,
      resume_candidate_email: signals.candidate_email,
      name_mismatch: nameMismatch,
      email_mismatch: emailMismatch,
      paste_heavy: pasteHeavy,
      no_camera: noCamera,
      tab_switches: tabSwitches,
      integrity_flags: integrityFlags,
    }).catch((err) => console.error("[integrity] save error:", err));

    return { ok: true as const };
  });
