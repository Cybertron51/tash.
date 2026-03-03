import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

/**
 * TASH — Stripe Connect API
 * 
 * This route handles:
 * 1. Creating a Stripe Express account for the user if they don't have one.
 * 2. Generating a "Connect Account Link" to send them to Stripe-hosted onboarding.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const { userId, email } = await req.json();

        if (!userId || !email) {
            return NextResponse.json({ error: "Missing userId or email" }, { status: 400 });
        }

        const protocol = req.headers.get("x-forwarded-proto") || "http";
        const host = req.headers.get("host") || req.nextUrl.host;
        const origin = `${protocol}://${host}`;

        console.log(`[api/connect] Derived origin: ${origin}`);

        // 1. Check if user already has a stripe_account_id
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("stripe_account_id")
            .eq("id", userId)
            .single();

        if (profileError) {
            return NextResponse.json({ error: "User profile not found" }, { status: 404 });
        }

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authError || !authData?.user) {
            return NextResponse.json({ error: "Auth user not found" }, { status: 404 });
        }

        if (!authData.user.email_confirmed_at) {
            return NextResponse.json({ error: "Please confirm your email before registering for Stripe." }, { status: 403 });
        }

        let stripeAccountId = profile.stripe_account_id;

        // 2. Create account if it doesn't exist
        if (!stripeAccountId) {
            try {
                // Ensure origin is a valid-looking URL for internal use, 
                // but omit it from Stripe's public business profile if it's a dev URL.
                const isDev = origin.includes("localhost") || origin.includes("127.0.0.1");

                const account = await stripe.accounts.create({
                    type: "express",
                    email: email,
                    business_profile: {
                        mcc: "5945", // Hobby, Toy, and Game Shops
                        // Omit URL if it's localhost to avoid Stripe validation errors
                        ...(isDev ? {} : { url: origin }),
                        product_description: "Identity verification for secure payouts of collectible card sales on Tash.",
                    },
                    capabilities: {
                        transfers: { requested: true },
                    },
                    metadata: {
                        userId: userId,
                    },
                });
                stripeAccountId = account.id;

                // Update profile with the new ID
                const { error: updateError } = await supabaseAdmin
                    .from("profiles")
                    .update({ stripe_account_id: stripeAccountId })
                    .eq("id", userId);

                if (updateError) {
                    console.error("Failed to update profile with stripe_account_id:", updateError);
                }
            } catch (err: any) {
                console.error("[api/connect] Stripe Account Create Error:", err);
                return NextResponse.json({
                    error: `Stripe Create Error: ${err.message}`,
                    param: err.param
                }, { status: 400 });
            }
        }

        // 3. Create an Account Link for onboarding
        try {
            const accountLink = await stripe.accountLinks.create({
                account: stripeAccountId,
                refresh_url: `${origin}/onboarding?step=4&status=refresh`,
                return_url: `${origin}/onboarding?step=4&status=success`,
                type: "account_onboarding",
            });

            return NextResponse.json({ url: accountLink.url });
        } catch (err: any) {
            console.error("[api/connect] Stripe Account Link Error:", err);
            return NextResponse.json({
                error: `Stripe Link Error: ${err.message}`,
                param: err.param
            }, { status: 400 });
        }
    } catch (error: any) {
        console.error("[api/connect] Internal Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
