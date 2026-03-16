import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "derekyp9@gmail.com";

/**
 * GET /api/admin/qr-codes
 * Admin-only: fetch all QR codes across all users with holdings and user info.
 */
export async function GET(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth || auth.email !== ADMIN_EMAIL) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const { data, error } = await supabaseAdmin
        .from("qr_codes")
        .select(`
            id,
            name,
            type,
            status,
            created_at,
            updated_at,
            profiles (
                name,
                email,
                username
            ),
            qr_code_holdings (
                id,
                holding_id,
                vault_holdings (
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
                    raw_image_url
                )
            )
        `)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const mapped = (data || []).map((qr: any) => ({
        ...qr,
        user: qr.profiles,
        holdings: (qr.qr_code_holdings || []).map((qch: any) => ({
            junctionId: qch.id,
            ...qch.vault_holdings,
            set: qch.vault_holdings?.set_name,
            grade: qch.vault_holdings?.psa_grade,
        })),
        profiles: undefined,
        qr_code_holdings: undefined,
    }));

    return NextResponse.json(mapped);
}

/**
 * PATCH /api/admin/qr-codes
 * Admin-only: approve/disapprove individual holdings within a QR code group.
 * Body: { holdingId, action: "approve" | "disapprove" }
 */
export async function PATCH(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth || auth.email !== ADMIN_EMAIL) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { holdingId, action = "approve" } = body;

    if (!holdingId) {
        return NextResponse.json({ error: "holdingId is required" }, { status: 400 });
    }

    const nextStatus = action === "disapprove" ? "disapproved" : "tradable";

    const { data, error } = await supabaseAdmin
        .from("vault_holdings")
        .update({ status: nextStatus })
        .eq("id", holdingId)
        .in("status", ["shipped", "pending_authentication"])
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}
