import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhookEvent } from "@/server/billing.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = (createFileRoute as any)("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sig = request.headers.get("stripe-signature");
        if (!sig) return new Response("Missing signature", { status: 400 });
        const payload = await request.text();
        try {
          await handleStripeWebhookEvent(payload, sig);
          return new Response("ok", { status: 200 });
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "Webhook error", { status: 400 });
        }
      },
    },
  },
});
