import { createFileRoute } from "@tanstack/react-router";

type ResendWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    click?: { link?: string };
    bounce?: unknown;
    reason?: string;
    [key: string]: unknown;
  };
};

const EVENT_COLUMNS: Record<string, string> = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.clicked": "clicked_at",
  "email.bounced": "bounced_at",
  "email.complained": "complained_at",
  "email.failed": "failed_at",
  "email.delivery_delayed": "last_event_at",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = (createFileRoute as any)("/api/resend-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const configuredSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
        if (configuredSecret) {
          const provided =
            request.headers.get("x-webhook-secret") ??
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
          if (provided !== configuredSecret) return new Response("unauthorized", { status: 401 });
        }

        const payload = (await request.json().catch(() => null)) as ResendWebhookPayload | null;
        if (!payload?.type || !payload.data?.email_id) {
          return new Response("bad request", { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL?.trim();
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!supabaseUrl || !serviceKey) return new Response("not configured", { status: 500 });

        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const timestamp = payload.created_at ?? new Date().toISOString();
        const update: Record<string, unknown> = {
          last_event_at: timestamp,
          last_event_type: payload.type,
          event_payload: payload,
        };

        const eventColumn = EVENT_COLUMNS[payload.type];
        if (eventColumn) update[eventColumn] = timestamp;
        if (payload.type === "email.clicked") update.last_click_url = payload.data.click?.link ?? null;
        if (payload.type === "email.bounced" || payload.type === "email.failed") {
          update.error = JSON.stringify(payload.data.bounce ?? payload.data.reason ?? payload.data);
        }

        const { error } = await admin
          .from("email_outreach_log")
          .update(update)
          .eq("provider_message_id", payload.data.email_id);

        if (error) {
          console.error("[resend-webhook] update failed", error);
          return new Response("db error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
