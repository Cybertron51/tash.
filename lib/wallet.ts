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
 * Calculates the date 3 business days ago.
 */
export function getThreeBusinessDaysAgo(): Date {
    const date = new Date();
    let daysToSubtract = 3;

    while (daysToSubtract > 0) {
        date.setDate(date.getDate() - 1);
        const day = date.getDay();
        // 0 = Sunday, 6 = Saturday
        if (day !== 0 && day !== 6) {
            daysToSubtract--;
        }
    }
    return date;
}

/**
 * Calculates the amount of unsettled funds for a user.
 * Funds are unsettled if they come from deposits or sales within the last 3 business days.
 */
export async function getUnsettledFunds(userId: string): Promise<number> {
    const threeDaysAgo = getThreeBusinessDaysAgo().toISOString();

    const [depositsRes, salesRes] = await Promise.all([
        supabaseAdmin
            .from("stripe_transactions")
            .select("amount")
            .eq("user_id", userId)
            .eq("type", "deposit")
            .gt("created_at", threeDaysAgo),
        supabaseAdmin
            .from("trades")
            .select("price")
            .eq("seller_id", userId)
            .gt("executed_at", threeDaysAgo)
    ]);

    const depositSum = depositsRes.data?.reduce((sum, row) => sum + Number(row.amount), 0) || 0;
    const saleSum = salesRes.data?.reduce((sum, row) => sum + Number(row.price), 0) || 0;

    return depositSum + saleSum;
}
