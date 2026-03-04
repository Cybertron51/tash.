import Stripe from "stripe";

/**
 * TASH — Stripe Service Layer
 * 
 * This file initializes the Stripe client as a singleton to be used
 * across the application. It handles environment variable validation
 * and provides a consistent interface for both platform and Connect accounts.
 */

if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required but missing from environment variables.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    // Use the latest stable version or the one specified in your project
    apiVersion: "2026-01-28.clover" as any,
    typescript: true,
    appInfo: {
        name: "Tash Ledger",
        version: "0.1.0",
    },
});

/**
 * Helper to get the platform account ID
 */
export const getPlatformAccountId = () => {
    return process.env.STRIPE_ACCOUNT_ID;
};

/**
 * Validates if the Stripe configuration is complete
 */
export const isStripeConfigured = () => {
    return !!(
        process.env.STRIPE_SECRET_KEY &&
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
        (process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_CONNECT_WEBHOOK_SECRET)
    );
};

/**
 * Creates a Transfer from the Platform account to a Connected Account.
 * This is used when a user "withdraws" their Tash balance.
 *
 * @param amountCents - Amount in cents to transfer
 * @param destinationAccountId - The connected account's Stripe ID (acct_...)
 * @param metadata - Optional metadata for the transfer
 */
export async function createTransfer(
    amountCents: number,
    destinationAccountId: string,
    metadata?: Record<string, string>
) {
    return stripe.transfers.create({
        amount: amountCents,
        currency: "usd",
        destination: destinationAccountId,
        metadata: metadata || {},
    });
}
