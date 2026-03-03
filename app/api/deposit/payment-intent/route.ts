import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const globalSupabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const MIN_CENTS = 100;   // $1.00
const MAX_CENTS = 1_000_000; // $10,000.00

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amountCents, userId } = body;

    const { data: authData, error: authError } = await globalSupabaseAdmin.auth.admin.getUserById(userId);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Auth user not found" }, { status: 404 });
    }
    if (!authData.user.email_confirmed_at) {
      return NextResponse.json({ error: "Please confirm your email before depositing." }, { status: 403 });
    }

    if (
      typeof amountCents !== "number" ||
      !Number.isInteger(amountCents) ||
      amountCents < MIN_CENTS ||
      amountCents > MAX_CENTS
    ) {
      return NextResponse.json(
        { error: "Amount must be between $10 and $10,000" },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      payment_method_types: ["card"],
      metadata: {
        userId: userId || "",
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("[deposit/payment-intent]", err);
    return NextResponse.json(
      { error: "Failed to create payment intent" },
      { status: 500 }
    );
  }
}
