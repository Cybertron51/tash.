import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

/**
 * TASH — Stripe Login Link API
 * 
 * Generates a secure, single-use login link that authenticates the user
 * directly into their Stripe Express dashboard without a password.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await verifyAuth(req);
        if (!auth) return unauthorized();
        if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

        // 1. Get the user's stripe_account_id
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("stripe_account_id")
            .eq("id", auth.userId)
            .single();

        if (profileError || !profile?.stripe_account_id) {
            return NextResponse.json({ error: "Stripe account not linked" }, { status: 404 });
        }

        // 2. Create the express login link
        // This link is single-use and expires quickly
        const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id);

        return NextResponse.json({ url: loginLink.url });

    } catch (error: any) {
        console.error("[api/connect/login] Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
