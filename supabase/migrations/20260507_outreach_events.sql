-- Add provider/webhook fields for Resend delivery, open, click, and failure
-- analytics. Safe to run repeatedly.

alter table public.email_outreach_log
  add column if not exists provider_message_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists last_event_at timestamptz,
  add column if not exists last_event_type text,
  add column if not exists last_click_url text,
  add column if not exists event_payload jsonb not null default '{}'::jsonb;

create index if not exists email_outreach_log_provider_message_idx
  on public.email_outreach_log (provider_message_id);
