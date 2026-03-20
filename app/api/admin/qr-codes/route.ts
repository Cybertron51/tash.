import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const QR_SELECT = `
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
`;

function mapQrCode(qr: any) {
    return {
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
    };
}

/**
 * GET /api/admin/qr-codes
 * Admin-only: fetch all QR codes, or a single one via ?id=<uuid>.
 */
export async function GET(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const { data: adminProfile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', auth.userId).single();
    if (!adminProfile?.is_admin) return unauthorized();

    const id = req.nextUrl.searchParams.get("id");

    if (id) {
        const { data, error } = await supabaseAdmin
            .from("qr_codes")
            .select(QR_SELECT)
            .eq("id", id)
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
        return NextResponse.json(mapQrCode(data));
    }

    const { data, error } = await supabaseAdmin
        .from("qr_codes")
        .select(QR_SELECT)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json((data || []).map(mapQrCode));
}

/**
 * PATCH /api/admin/qr-codes
 * Admin-only: approve/disapprove individual holdings, or mark a batch as received.
 *
 * Approve/Disapprove: { holdingId, action: "approve" | "disapprove" }
 * Receive batch:      { qrCodeId, action: "receive" }
 */
export async function PATCH(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const { data: adminProfile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', auth.userId).single();
    if (!adminProfile?.is_admin) return unauthorized();

    const body = await req.json();
    const { action } = body;

    if (action === "receive") {
        const { qrCodeId } = body;
        if (!qrCodeId) return NextResponse.json({ error: "qrCodeId is required" }, { status: 400 });

        const { data, error } = await supabaseAdmin
            .from("qr_codes")
            .update({ status: "received" })
            .eq("id", qrCodeId)
            .in("status", ["pending", "submitted"])
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Trickle down status to vault_holdings
        const { data: junctions } = await supabaseAdmin
            .from("qr_code_holdings")
            .select("holding_id")
            .eq("qr_code_id", qrCodeId);
            
        if (junctions && junctions.length > 0) {
            const holdingIds = junctions.map((j: any) => j.holding_id);
            await supabaseAdmin
                .from("vault_holdings")
                .update({ status: "received" })
                .in("id", holdingIds)
                .eq("status", "drop_off");
        }

        return NextResponse.json(data);
    }

    const { holdingId } = body;
    if (!holdingId) return NextResponse.json({ error: "holdingId is required" }, { status: 400 });

    const nextStatus = action === "disapprove" ? "disapproved" : "tradable";

    const { data, error } = await supabaseAdmin
        .from("vault_holdings")
        .update({ status: nextStatus })
        .eq("id", holdingId)
        .in("status", ["shipped", "drop_off", "pending_authentication", "received"])
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}
