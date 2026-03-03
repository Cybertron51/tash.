import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

/**
 * PATCH /api/vault/update
 * Update a vault holding's status (ship, list, cancel listing).
 * Body: { holdingId, status, listingPrice? }
 */
export async function PATCH(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { holdingId, status, listingPrice } = body;

    if (!holdingId || !status) {
        return NextResponse.json({ error: "holdingId and status are required" }, { status: 400 });
    }

    // Validate status transition
    const validStatuses = [
        "pending_authentication", "shipped", "received",
        "authenticating", "tradable", "withdrawn", "listed",
    ];
    if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    const payload: Record<string, unknown> = { status };
    if (listingPrice !== undefined) payload.listing_price = listingPrice;

    const { data, error } = await supabaseAdmin
        .from("vault_holdings")
        .update(payload)
        .eq("id", holdingId)
        .eq("user_id", auth.userId)  // Security: only own holdings
        .select()
        .single();

    if (error) {
        console.error("Supabase Error:", error); return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
