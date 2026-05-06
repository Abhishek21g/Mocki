import { createServerClientForUser } from "./supabase.server";
import type { Persona, RoleProfile, Round } from "./sessions.server";
import type { Report } from "./agents.server";

/**
 * Shape of the JSON payload we store for each completed interview. This is the
 * superset of what the report page needs to re-render without rerunning agents.
 */
export type InterviewSessionPayload = Report & {
  sessionId: string;
  rounds: Round[];
  role: string;
  company: string;
  jobDescription: string;
  resume: string;
  interviewers: Persona[];
  panelType: string;
  totalRounds: number;
  roleProfile: RoleProfile;
};

export type InterviewSessionRow = {
  id: string;
  user_id: string;
  created_at: string;
  ended_at: string | null;
  role: string | null;
  company: string | null;
  interview_type: string | null;
  overall_score: number | null;
  hire_decision: string | null;
  metadata: Record<string, unknown>;
  payload: InterviewSessionPayload;
};

export type LearnerMemory = {
  weakTopics: string[];
  strongTopics: string[];
  lastSummary: string | null;
  lastRoles: string[];
  totalSessions: number;
  updatedAt: string | null;
};

const EMPTY_MEMORY: LearnerMemory = {
  weakTopics: [],
  strongTopics: [],
  lastSummary: null,
  lastRoles: [],
  totalSessions: 0,
  updatedAt: null,
};

export function emptyLearnerMemory(): LearnerMemory {
  return { ...EMPTY_MEMORY };
}

export async function persistInterviewSession(
  accessToken: string,
  userId: string,
  payload: InterviewSessionPayload,
  metadata: Record<string, unknown>,
): Promise<InterviewSessionRow | null> {
  const client = createServerClientForUser(accessToken);
  const { data, error } = await client
    .from("interview_sessions")
    .insert({
      user_id: userId,
      ended_at: new Date().toISOString(),
      role: payload.role,
      company: payload.company,
      interview_type: (metadata.interview_type as string) ?? null,
      overall_score: payload.overall_score,
      hire_decision: payload.hire_decision,
      metadata,
      payload,
    })
    .select("*")
    .single();
  if (error) {
    console.error("persistInterviewSession error", error);
    return null;
  }
  return data as InterviewSessionRow;
}

export async function listInterviewSessions(accessToken: string): Promise<InterviewSessionRow[]> {
  const client = createServerClientForUser(accessToken);
  const { data, error } = await client
    .from("interview_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("listInterviewSessions error", error);
    return [];
  }
  return (data ?? []) as InterviewSessionRow[];
}

export async function getInterviewSessionRow(
  accessToken: string,
  sessionId: string,
): Promise<InterviewSessionRow | null> {
  const client = createServerClientForUser(accessToken);
  const { data, error } = await client
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("getInterviewSessionRow error", error);
    return null;
  }
  return (data as InterviewSessionRow | null) ?? null;
}

export async function getLearnerMemoryForUser(accessToken: string): Promise<LearnerMemory> {
  const client = createServerClientForUser(accessToken);
  const { data, error } = await client.from("profiles").select("learner_memory").maybeSingle();
  if (error) {
    console.error("getLearnerMemoryForUser error", error);
    return emptyLearnerMemory();
  }
  return mergeLearnerMemory(data?.learner_memory);
}

export async function setLearnerMemoryForUser(
  accessToken: string,
  userId: string,
  memory: LearnerMemory,
): Promise<void> {
  const client = createServerClientForUser(accessToken);
  const { error } = await client
    .from("profiles")
    .upsert({ id: userId, learner_memory: memory }, { onConflict: "id" });
  if (error) {
    console.error("setLearnerMemoryForUser error", error);
  }
}

export async function clearLearnerMemoryForUser(
  accessToken: string,
  userId: string,
): Promise<void> {
  await setLearnerMemoryForUser(accessToken, userId, emptyLearnerMemory());
}

export async function deleteInterviewSessionRow(
  accessToken: string,
  sessionId: string,
): Promise<boolean> {
  const client = createServerClientForUser(accessToken);
  const { error } = await client.from("interview_sessions").delete().eq("id", sessionId);
  if (error) {
    console.error("deleteInterviewSessionRow error", error);
    return false;
  }
  return true;
}

export function mergeLearnerMemory(value: unknown): LearnerMemory {
  if (!value || typeof value !== "object") return emptyLearnerMemory();
  const v = value as Partial<LearnerMemory>;
  return {
    weakTopics: Array.isArray(v.weakTopics)
      ? v.weakTopics.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
    strongTopics: Array.isArray(v.strongTopics)
      ? v.strongTopics.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
    lastSummary: typeof v.lastSummary === "string" ? v.lastSummary : null,
    lastRoles: Array.isArray(v.lastRoles)
      ? v.lastRoles.filter((item): item is string => typeof item === "string").slice(0, 6)
      : [],
    totalSessions: typeof v.totalSessions === "number" ? v.totalSessions : 0,
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : null,
  };
}

const dedupePush = (existing: string[], incoming: string[], cap: number) => {
  const map = new Map<string, string>();
  [...incoming, ...existing].forEach((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!map.has(key)) map.set(key, trimmed);
  });
  return Array.from(map.values()).slice(0, cap);
};

export function buildUpdatedMemoryFromReport(
  prior: LearnerMemory,
  payload: InterviewSessionPayload,
): LearnerMemory {
  const weakAdds: string[] = [];
  const strongAdds: string[] = [];

  payload.weaknesses.forEach((item) => weakAdds.push(item));
  payload.strengths.forEach((item) => strongAdds.push(item));
  payload.rounds.forEach((round) => {
    round.evaluation.weaknesses?.forEach((item) => weakAdds.push(item));
    round.evaluation.strengths?.forEach((item) => strongAdds.push(item));
    round.evaluation.missed_concepts?.forEach((item) => weakAdds.push(item));
  });

  const summaryBits: string[] = [];
  summaryBits.push(
    `Most recent: ${payload.role} @ ${payload.company} → ${payload.overall_score.toFixed(1)}/10 (${payload.hire_decision}).`,
  );
  if (payload.weaknesses.length) {
    summaryBits.push(`Weak areas: ${payload.weaknesses.slice(0, 3).join("; ")}.`);
  }
  if (payload.study_plan) {
    summaryBits.push(`Plan: ${payload.study_plan.slice(0, 240)}`);
  }

  return {
    weakTopics: dedupePush(prior.weakTopics, weakAdds, 12),
    strongTopics: dedupePush(prior.strongTopics, strongAdds, 12),
    lastSummary: summaryBits.join(" "),
    lastRoles: dedupePush(prior.lastRoles, [`${payload.role} @ ${payload.company}`], 6),
    totalSessions: prior.totalSessions + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function memoryToPromptBlock(memory: LearnerMemory | null): string {
  if (!memory || memory.totalSessions === 0) return "";
  const lines: string[] = [];
  lines.push("Returning candidate context (from prior mock interviews on this account):");
  lines.push(`- Total prior sessions: ${memory.totalSessions}`);
  if (memory.lastRoles.length) {
    lines.push(`- Recent target roles: ${memory.lastRoles.join("; ")}`);
  }
  if (memory.weakTopics.length) {
    lines.push(`- Recurring weak areas: ${memory.weakTopics.slice(0, 6).join("; ")}`);
  }
  if (memory.strongTopics.length) {
    lines.push(`- Demonstrated strengths: ${memory.strongTopics.slice(0, 6).join("; ")}`);
  }
  if (memory.lastSummary) {
    lines.push(`- Last session takeaways: ${memory.lastSummary}`);
  }
  return lines.join("\n");
}
