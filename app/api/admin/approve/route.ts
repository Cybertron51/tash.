import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/approve
 * Admin-only: approve a shipped item to "tradable".
 * Body: { holdingId }
 */
export async function PATCH(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    // 2. Check if user is admin (hardcoded for now)
    if (auth.email !== "derekyp9@gmail.com") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { holdingId, action = "approve" } = body;

    if (!holdingId) {
        return NextResponse.json({ error: "holdingId is required" }, { status: 400 });
    }

    const nextStatus = action === "disapprove" ? "disapproved" : action === "reset" ? "pending_authentication" : action === "return" ? "pending_authentication" : "tradable";

    const { data, error } = await supabaseAdmin
        .from("vault_holdings")
        .update({ status: nextStatus })
        .eq("id", holdingId)
        .in("status", ["shipped", "pending_authentication", "returning"])  // Can process shipped, pending, or returning items
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

/**
 * GET /api/admin/approve
 * Returns all items with status = 'shipped' (pending approval).
 */
export async function GET(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (auth.email !== "derekyp9@gmail.com") {
        return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const { data, error } = await supabaseAdmin
        .from("vault_holdings")
        .select(`
      id,
      symbol,
      name,
      set_name,
      year,
      psa_grade,
      cert_number,
      acquisition_price,
      status,
      image_url,
      raw_image_url,
      shipping_address,
      profiles(name, email)
    `)
        .in("status", ["shipped", "pending_authentication", "returning"])
        .order("created_at", { ascending: false });

    console.log(`[Admin GET] Fetching shipped/pending items. User: ${auth.userId}`);
    console.log(`[Admin GET] Data length:`, data?.length, `Error:`, error);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedData = (data || []).map(item => ({
        ...item,
        set: item.set_name,
        grade: item.psa_grade
    }));

    return NextResponse.json(mappedData);
}
