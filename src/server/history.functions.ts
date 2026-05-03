import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  clearLearnerMemoryForUser,
  deleteInterviewSessionRow,
  getInterviewSessionRow,
  getLearnerMemoryForUser,
  listInterviewSessions,
  type InterviewSessionRow,
  type LearnerMemory,
} from "./history.server";
import { getUserIdForToken } from "./supabase.server";

const TokenSchema = z.object({ accessToken: z.string().min(10).max(8000) });

const SessionFetchSchema = TokenSchema.extend({
  sessionId: z.string().min(8).max(80),
});

export type HistoryListItem = {
  id: string;
  createdAt: string;
  endedAt: string | null;
  role: string | null;
  company: string | null;
  interviewType: string | null;
  overallScore: number | null;
  hireDecision: string | null;
};

function toListItem(row: InterviewSessionRow): HistoryListItem {
  return {
    id: row.id,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    role: row.role,
    company: row.company,
    interviewType: row.interview_type,
    overallScore: row.overall_score,
    hireDecision: row.hire_decision,
  };
}

export const fetchInterviewHistory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) {
      return { ok: false as const, reason: "unauthorized" as const, items: [] };
    }
    const rows = await listInterviewSessions(data.accessToken);
    return { ok: true as const, items: rows.map(toListItem) };
  });

export const fetchInterviewSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SessionFetchSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) {
      return { ok: false as const, reason: "unauthorized" as const, payload: null };
    }
    const row = await getInterviewSessionRow(data.accessToken, data.sessionId);
    if (!row) {
      return { ok: false as const, reason: "not_found" as const, payload: null };
    }
    return { ok: true as const, payload: row.payload };
  });

export const fetchLearnerMemory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) {
      return { ok: false as const, reason: "unauthorized" as const, memory: null };
    }
    const memory: LearnerMemory = await getLearnerMemoryForUser(data.accessToken);
    return { ok: true as const, memory };
  });

export const clearLearnerMemory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) {
      return { ok: false as const, reason: "unauthorized" as const };
    }
    await clearLearnerMemoryForUser(data.accessToken, userId);
    return { ok: true as const };
  });

export const deleteInterviewSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SessionFetchSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getUserIdForToken(data.accessToken);
    if (!userId) {
      return { ok: false as const, reason: "unauthorized" as const };
    }
    const success = await deleteInterviewSessionRow(data.accessToken, data.sessionId);
    if (!success) {
      return { ok: false as const, reason: "delete_failed" as const };
    }
    return { ok: true as const };
  });
