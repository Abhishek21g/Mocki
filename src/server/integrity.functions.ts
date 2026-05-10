import { createSupabaseAdminClient } from "./supabase.server";

export type IntegrityRecord = {
  session_id: string;
  user_id: string | null;
  account_email: string | null;
  resume_candidate_name: string | null;
  resume_candidate_email: string | null;
  name_mismatch: boolean;
  email_mismatch: boolean;
  paste_heavy: boolean;
  no_camera: boolean;
  tab_switches: number;
  integrity_flags: string[];
};

export async function saveIntegrityRecord(record: IntegrityRecord): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin.from("session_integrity").upsert({
    session_id: record.session_id,
    user_id: record.user_id ?? null,
    account_email: record.account_email ?? null,
    resume_candidate_name: record.resume_candidate_name ?? null,
    resume_candidate_email: record.resume_candidate_email ?? null,
    name_mismatch: record.name_mismatch,
    email_mismatch: record.email_mismatch,
    paste_heavy: record.paste_heavy,
    no_camera: record.no_camera,
    tab_switches: record.tab_switches,
    integrity_flags: record.integrity_flags,
  });
  if (error) {
    console.error("[integrity] save failed:", error.message);
  }
}
