import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";
import { getUnsettledFunds } from "@/lib/wallet";

/**
 * GET /api/user/profile — Returns authenticated user's profile.
 * PATCH /api/user/profile — Update profile fields (onboarding, etc.)
 */
export async function GET(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id, email, name, username, favorite_tcgs, primary_goal, cash_balance, locked_balance, created_at, stripe_account_id, onboarding_complete")
        .eq("id", auth.userId)
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const unsettledFunds = await getUnsettledFunds(auth.userId);
    const withdrawable_balance = Math.max(0, Number(data.cash_balance) - unsettledFunds);

    return NextResponse.json({
        ...data,
        withdrawable_balance
    });
}

export async function PATCH(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const allowedFields = ["name", "username", "favorite_tcgs", "primary_goal"];
    const payload: Record<string, unknown> = {};

    for (const field of allowedFields) {
        if (body[field] !== undefined) payload[field] = body[field];
    }

    if (Object.keys(payload).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("profiles")
        .update(payload)
        .eq("id", auth.userId)
        .select()
        .single();

    if (error) {
        // Postgres unique-constraint violation
        if (error.code === "23505" || error.message?.includes("duplicate key") || error.message?.includes("unique constraint")) {
            return NextResponse.json({ error: "username already taken" }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
