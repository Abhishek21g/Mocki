import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = (createFileRoute as any)("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sig = request.headers.get("stripe-signature");
        if (!sig) return new Response("Missing signature", { status: 400 });

        const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
        if (!stripeKey || !webhookSecret) return new Response("Not configured", { status: 500 });

        const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });

        let event: Stripe.Event;
        const payload = await request.text();
        try {
          event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
        } catch {
          return new Response("Webhook signature verification failed", { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL?.trim();
        const serviceKey =
          process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
          process.env.SUPABASE_ANON_KEY?.trim();

        if (supabaseUrl && serviceKey) {
          const admin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;
            await admin
              .from("profiles")
              .update({ is_pro: true })
              .eq("stripe_customer_id", session.customer as string);
          } else if (
            event.type === "customer.subscription.deleted" ||
            event.type === "customer.subscription.paused"
          ) {
            const sub = event.data.object as Stripe.Subscription;
            await admin
              .from("profiles")
              .update({ is_pro: false })
              .eq("stripe_customer_id", sub.customer as string);
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
