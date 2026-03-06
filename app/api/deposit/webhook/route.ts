import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { updateBalance } from "@/lib/wallet";
import { createClient } from "@supabase/supabase-js";

/**
 * TASH — Stripe Webhook Endpoint
 * 
 * This endpoint processes events from Stripe:
 * 1. payment_intent.succeeded: Increments a user's cash_balance after a deposit.
 * 2. account.updated: Updates a user's status when they complete Stripe onboarding.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!sig || (!webhookSecret && !connectSecret)) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  let event;
  try {
    // Try standard webhook secret first
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      throw new Error("Missing Standard Webhook Secret");
    }
  } catch (err: any) {
    // Fallback to Connect webhook secret if it exists
    if (connectSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, sig, connectSecret);
      } catch (connectErr: any) {
        console.error("[webhook] Signature verification failed for both secrets:", connectErr.message);
        return NextResponse.json({ error: `Webhook Error: ${connectErr.message}` }, { status: 400 });
      }
    } else {
      console.error("[webhook] Signature verification failed:", err.message);
      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as any;
        const userId = paymentIntent.metadata?.userId;

        if (userId) {
          const piId = paymentIntent.id;
          const amountInDollars = paymentIntent.amount / 100;

          // ATOMIC IDEMPOTENCY: Insert with ON CONFLICT DO NOTHING.
          // If the row already exists (duplicate event), the insert is a no-op.
          const { data: inserted, status } = await supabaseAdmin
            .from("stripe_transactions")
            .upsert(
              {
                id: piId,
                user_id: userId,
                amount: amountInDollars,
                type: "deposit"
              },
              { onConflict: "id", ignoreDuplicates: true }
            )
            .select("id");

          // Only credit balance if we actually inserted a new row
          if (!inserted || inserted.length === 0) {
            console.log(`[webhook] Transaction ${piId} already processed, skipping.`);
            break;
          }

          await updateBalance(userId, amountInDollars);
          console.log(`[webhook] Deposit credited (PI): ${amountInDollars} to user ${userId}`);
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as any;
        const userId = session.metadata?.userId;

        if (userId && session.payment_status === "paid" && session.payment_intent) {
          const piId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent.id;
          const amountInDollars = (session.amount_total || 0) / 100;

          // ATOMIC IDEMPOTENCY: Insert with ON CONFLICT DO NOTHING.
          const { data: inserted } = await supabaseAdmin
            .from("stripe_transactions")
            .upsert(
              {
                id: piId,
                user_id: userId,
                amount: amountInDollars,
                type: "deposit"
              },
              { onConflict: "id", ignoreDuplicates: true }
            )
            .select("id");

          if (!inserted || inserted.length === 0) {
            console.log(`[webhook] Transaction ${piId} already processed (via checkout), skipping.`);
            break;
          }

          await updateBalance(userId, amountInDollars);
          console.log(`[webhook] Deposit credited (Checkout): ${amountInDollars} to user ${userId}`);
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object as any;
        const userId = account.metadata?.userId;

        // Strict verification: require both payouts and charges to be active
        const isFullyVerified = !!(account.details_submitted && account.payouts_enabled && account.charges_enabled);

        if (userId) {
          const { error: updateErr } = await supabaseAdmin
            .from("profiles")
            .update({ stripe_onboarding_complete: isFullyVerified })
            .eq("id", userId);

          if (updateErr) {
            console.error(`[webhook] Failed to update onboarding status for user ${userId}:`, updateErr);
          } else {
            console.log(`[webhook] Onboarding status updated for user ${userId}: ${isFullyVerified}`);
          }
        }
        break;
      }

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[webhook] Processing error:", err.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
