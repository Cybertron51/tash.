import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/user/sync-referral
 * Syncs a referral code from a cookie/client to the user's profile.
 * Only works if the profile doesn't already have one.
 */
export async function POST(req: NextRequest) {
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    try {
        const { userId, code } = await req.json();

        if (!userId || !code) {
            return NextResponse.json({ error: "Missing userId or code" }, { status: 400 });
        }

        // 1. Get the referral code ID
        const { data: refCode, error: refError } = await supabaseAdmin
            .from("referral_codes")
            .select("id")
            .eq("code", code)
            .maybeSingle();

        if (refError) throw refError;
        if (!refCode) {
            return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
        }

        // 2. Update the profile ONLY if it doesn't have one yet
        const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({ referral_code_id: refCode.id })
            .eq("id", userId)
            .is("referral_code_id", null);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, referral_code_id: refCode.id });
    } catch (err: any) {
        console.error("Referral sync error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
