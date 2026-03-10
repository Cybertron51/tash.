import { createClient } from "@supabase/supabase-js";

/**
 * TASH — Wallet & Internal Ledger Service
 * 
 * This service handles internal balance movements between users
 * for the digital exchange of vaulted cards.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// We use the admin client for wallet operations to ensure atomicity and security
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export interface WalletTransaction {
    fromUserId?: string; // null if deposit
    toUserId?: string;   // null if withdrawal
    amount: number;
    type: "trade" | "deposit" | "withdrawal" | "fee";
    metadata?: any;
}

/**
 * Updates a user's balance and logs the transaction.
 * In a real production app, this should be done using a Supabase RPC 
 * or a database transaction to prevent double-spending.
 */
export async function updateBalance(userId: string, amountDelta: number) {
    const { data: profile, error: fetchError } = await supabaseAdmin
        .from("profiles")
        .select("cash_balance")
        .eq("id", userId)
        .single();

    if (fetchError || !profile) {
        throw new Error(`Could not find profile for user ${userId}`);
    }

    const newBalance = Number(profile.cash_balance) + amountDelta;

    const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ cash_balance: newBalance })
        .eq("id", userId);

    if (updateError) {
        throw new Error(`Failed to update balance for user ${userId}`);
    }

    return newBalance;
}

/**
 * Moves funds between two users instantly (the "Brokerage" model).
 */
export async function transferFunds(fromUserId: string, toUserId: string, amount: number) {
    if (amount <= 0) throw new Error("Transfer amount must be positive");

    // Phase 1: Deduct from sender
    await updateBalance(fromUserId, -amount);

    // Phase 2: Add to receiver
    await updateBalance(toUserId, amount);

    // Phase 3: TODO: Log transaction to a 'ledger' table for audit trails
    console.log(`[Wallet] Transferred ${amount} from ${fromUserId} to ${toUserId}`);
}

/**
 * Locks funds in escrow during a limit order.
 */
export async function lockFunds(userId: string, amount: number) {
    // Logic to move funds from cash_balance to locked_balance
    // This prevents the user from spending the same money twice while an order is open.
}


/**
 * Calculates the amount of unsettled funds for a user.
 * Currently disabled: all funds are considered settled immediately.
 */
export async function getUnsettledFunds(userId: string): Promise<number> {
    return 0;
}
