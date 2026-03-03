import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createTransfer } from "@/lib/stripe";
import { updateBalance } from "@/lib/wallet";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

/**
 * TASH — Withdraw API
 *
 * Supports two types of withdrawals:
 *
 * 1. **Cash Withdrawal** (`type: "cash"`)
 *    Moves funds from the user's Tash balance to their connected Stripe account.
 *    Stripe then pays out to their bank automatically.
 *
 * 2. **Physical Card Withdrawal** (`type: "holding"`)
 *    Marks a vaulted card as "withdrawn" and deducts a 3.5% fee.
 *    The physical card is then shipped back to the user.
 */

const MIN_WITHDRAW_CENTS = 100;       // $1.00
const MAX_WITHDRAW_CENTS = 1_000_000; // $10,000.00

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();
  if (!auth.emailConfirmed) {
    return NextResponse.json({ error: "Please confirm your email before withdrawing." }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const withdrawType = body.type || "cash";

    if (withdrawType === "cash") {
      return handleCashWithdrawal(auth.userId, body);
    } else if (withdrawType === "holding") {
      return handleHoldingWithdrawal(auth.userId, body);
    } else {
      return NextResponse.json({ error: "Invalid withdrawal type" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[withdraw] Error:", err.message);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────
// Cash Withdrawal (Stripe Connect Transfer)
// ─────────────────────────────────────────────────────────

async function handleCashWithdrawal(userId: string, body: any) {
  const { amountCents } = body;

  // Validate amount
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_WITHDRAW_CENTS ||
    amountCents > MAX_WITHDRAW_CENTS
  ) {
    return NextResponse.json(
      { error: `Amount must be between $${MIN_WITHDRAW_CENTS / 100} and $${MAX_WITHDRAW_CENTS / 100}` },
      { status: 400 }
    );
  }

  // Fetch profile
  const { data: profile, error: profileErr } = await supabaseAdmin!
    .from("profiles")
    .select("cash_balance, stripe_account_id, onboarding_complete")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Validate Connect status
  if (!profile.stripe_account_id || !profile.onboarding_complete) {
    return NextResponse.json(
      { error: "Please complete your Stripe Connect setup before withdrawing." },
      { status: 403 }
    );
  }

  // Validate sufficient balance
  const amountDollars = amountCents / 100;
  const currentBalance = Number(profile.cash_balance);

  if (currentBalance < amountDollars) {
    return NextResponse.json(
      { error: `Insufficient balance. You have $${currentBalance.toFixed(2)} available.` },
      { status: 400 }
    );
  }

  // Step 1: Deduct from Tash balance
  const newBalance = await updateBalance(userId, -amountDollars);

  // Step 2: Create Stripe Transfer
  try {
    const transfer = await createTransfer(
      amountCents,
      profile.stripe_account_id,
      { userId, type: "withdrawal" }
    );

    console.log(`[withdraw] Transfer ${transfer.id}: $${amountDollars} → ${profile.stripe_account_id}`);

    // Step 3: Log to stripe_transactions ledger
    await supabaseAdmin!
      .from("stripe_transactions")
      .insert({
        id: transfer.id,
        user_id: userId,
        amount: amountDollars,
        type: "withdrawal"
      });

    return NextResponse.json({
      success: true,
      transferId: transfer.id,
      amount: amountDollars,
      newBalance,
    });
  } catch (stripeErr: any) {
    // Rollback: refund deducted balance
    console.error("[withdraw] Stripe transfer failed, rolling back:", stripeErr.message);
    await updateBalance(userId, amountDollars);

    return NextResponse.json(
      { error: `Withdrawal failed: ${stripeErr.message}` },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────
// Holding Withdrawal (Physical Card Shipback)
// ─────────────────────────────────────────────────────────

async function handleHoldingWithdrawal(userId: string, body: any) {
  const { holdingId, currentValueUsd } = body;

  if (!holdingId || !currentValueUsd) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 1. Calculate 3.5% withdrawal fee
  const fee = currentValueUsd * 0.035;

  // 2. Fetch user profile to check balance covers fee
  const { data: profile, error: profileErr } = await supabaseAdmin!
    .from("profiles")
    .select("cash_balance")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 500 });
  }

  if (Number(profile.cash_balance) < fee) {
    return NextResponse.json({ error: "Insufficient funds to cover withdrawal fee" }, { status: 400 });
  }

  // 3. Update holding status to 'withdrawn'
  const { error: updateErr, data: updatedData } = await supabaseAdmin!
    .from("vault_holdings")
    .update({ status: "withdrawn" })
    .eq("id", holdingId)
    .eq("user_id", userId)
    .eq("status", "tradable")
    .select("id");

  if (updateErr || !updatedData?.length) {
    return NextResponse.json({ error: "Failed to update holding or holding is not tradable." }, { status: 400 });
  }

  // 4. Deduct fee from balance
  await updateBalance(userId, -fee);

  // 5. Log fee to stripe_transactions ledger
  await supabaseAdmin!
    .from("stripe_transactions")
    .insert({
      id: `fee_${holdingId}_${Date.now()}`,
      user_id: userId,
      amount: fee,
      type: "withdrawal"
    });

  return NextResponse.json({
    success: true,
    message: "Withdrawal requested successfully.",
    feeCharged: fee,
  });
}
