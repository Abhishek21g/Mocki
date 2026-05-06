import Stripe from "stripe";
import { createSupabaseAdminClient } from "./supabase.server";

export type Profile = {
  interviews_used: number;
  is_pro: boolean;
  stripe_customer_id: string | null;
};

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

export async function getOrCreateProfile(userId: string): Promise<Profile> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { interviews_used: 0, is_pro: false, stripe_customer_id: null };

  const { data } = await admin.from("profiles").select("*").eq("id", userId).single();
  if (data) return data as Profile;

  // First sign-in — create the row
  await admin.from("profiles").insert({ id: userId });
  return { interviews_used: 0, is_pro: false, stripe_customer_id: null };
}

export async function incrementInterviewsUsed(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  await admin.rpc("increment_interviews_used", { user_id: userId });
}

export async function createStripeCheckoutSession(
  userId: string,
  userEmail: string | undefined,
  returnUrl: string,
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const priceId = process.env.STRIPE_PRICE_ID?.trim();
  if (!priceId) return null;

  const admin = createSupabaseAdminClient();
  let customerId: string | undefined;

  if (admin) {
    const { data } = await admin.from("profiles").select("stripe_customer_id").eq("id", userId).single();
    if (data?.stripe_customer_id) {
      customerId = data.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      await admin.from("profiles").upsert({ id: userId, stripe_customer_id: customer.id });
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?upgraded=1`,
    cancel_url: returnUrl,
    allow_promotion_codes: true,
  });

  return session.url;
}

export async function handleStripeWebhookEvent(
  payload: string,
  signature: string,
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) return;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    throw new Error("Webhook signature verification failed");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = session.customer as string;
    await admin.from("profiles").update({ is_pro: true }).eq("stripe_customer_id", customerId);
  }

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.paused"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    await admin.from("profiles").update({ is_pro: false }).eq("stripe_customer_id", customerId);
  }
}
