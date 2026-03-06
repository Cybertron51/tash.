import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

/**
 * TASH — Stripe Connect Sync API
 * 
 * This endpoint checks the user's Stripe account status directly.
 * Use this as a fallback when webhooks (account.updated) fail to reach the server.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await verifyAuth(req);
        if (!auth) return unauthorized();
        if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

        // 1. Get the user's stripe_account_id
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("stripe_account_id, stripe_onboarding_complete")
            .eq("id", auth.userId)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: "User profile not found" }, { status: 404 });
        }

        if (!profile.stripe_account_id) {
            return NextResponse.json({
                synced: false,
                message: "No Stripe account linked yet."
            });
        }

        // 3. Fetch the account status from Stripe (with more detail)
        const account = await stripe.accounts.retrieve(profile.stripe_account_id);

        const isFullyVerified = !!(account.details_submitted && account.payouts_enabled && account.charges_enabled);

        // 5. Update DB if status has changed
        if (isFullyVerified && !profile.stripe_onboarding_complete) {
            await supabaseAdmin
                .from("profiles")
                .update({ stripe_onboarding_complete: true })
                .eq("id", auth.userId);

            return NextResponse.json({
                synced: true,
                stripeOnboardingComplete: true,
                message: "Profile verified! You are ready to trade."
            });
        } else if (!isFullyVerified && profile.stripe_onboarding_complete) {
            // Revert if Stripe status changed (e.g. restriction added)
            await supabaseAdmin
                .from("profiles")
                .update({ stripe_onboarding_complete: false })
                .eq("id", auth.userId);
        }

        return NextResponse.json({
            synced: true,
            stripeOnboardingComplete: isFullyVerified,
            message: isFullyVerified ? "All synced." : "Stripe verification still in progress or restricted.",
            details: {
                detailsSubmitted: account.details_submitted,
                payoutsEnabled: account.payouts_enabled,
                chargesEnabled: account.charges_enabled,
                requirements: account.requirements?.currently_due || []
            }
        });

    } catch (error: any) {
        console.error("[api/connect/sync] Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
