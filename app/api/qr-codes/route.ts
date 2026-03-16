import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/qr-codes
 * Fetch current user's QR codes with their holdings.
 */
export async function GET(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const { data: qrCodes, error } = await supabaseAdmin
        .from("qr_codes")
        .select(`
            id,
            name,
            type,
            status,
            created_at,
            updated_at,
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
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mapped = (qrCodes || []).map((qr) => ({
        ...qr,
        holdings: (qr.qr_code_holdings || []).map((qch: any) => ({
            junctionId: qch.id,
            ...qch.vault_holdings,
            set: qch.vault_holdings?.set_name,
            grade: qch.vault_holdings?.psa_grade,
        })),
        qr_code_holdings: undefined,
    }));

    return NextResponse.json(mapped);
}

/**
 * POST /api/qr-codes
 * Create a new QR code grouping.
 * Body: { name, type, holdingIds }
 */
export async function POST(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { name, type = "drop_off", holdingIds } = body;

    if (!name || !holdingIds || !Array.isArray(holdingIds) || holdingIds.length === 0) {
        return NextResponse.json({ error: "name and holdingIds are required" }, { status: 400 });
    }

    // Verify all holdings belong to user and are pending_authentication
    const { data: holdings, error: hErr } = await supabaseAdmin
        .from("vault_holdings")
        .select("id, status")
        .eq("user_id", auth.userId)
        .in("id", holdingIds);

    if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
    if (!holdings || holdings.length !== holdingIds.length) {
        return NextResponse.json({ error: "Some holdings not found or don't belong to you" }, { status: 400 });
    }

    const nonPending = holdings.filter((h) => h.status !== "pending_authentication");
    if (nonPending.length > 0) {
        return NextResponse.json({ error: "All holdings must be in pending_authentication status" }, { status: 400 });
    }

    // Create QR code
    const { data: qrCode, error: qrErr } = await supabaseAdmin
        .from("qr_codes")
        .insert({ user_id: auth.userId, name, type, status: "pending" })
        .select()
        .single();

    if (qrErr) return NextResponse.json({ error: qrErr.message }, { status: 500 });

    // Create junction rows
    const junctionRows = holdingIds.map((hId: string) => ({
        qr_code_id: qrCode.id,
        holding_id: hId,
    }));

    const { error: jErr } = await supabaseAdmin
        .from("qr_code_holdings")
        .insert(junctionRows);

    if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });

    // Set all holdings to shipped
    const { error: updateErr } = await supabaseAdmin
        .from("vault_holdings")
        .update({ status: "shipped" })
        .in("id", holdingIds)
        .eq("user_id", auth.userId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json(qrCode, { status: 201 });
}

/**
 * PATCH /api/qr-codes
 * Update QR code: rename, add/remove holdings.
 * Body: { qrCodeId, name?, addHoldingIds?, removeHoldingIds? }
 */
export async function PATCH(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { qrCodeId, name, addHoldingIds, removeHoldingIds } = body;

    if (!qrCodeId) {
        return NextResponse.json({ error: "qrCodeId is required" }, { status: 400 });
    }

    // Verify QR code belongs to user
    const { data: qr, error: qrErr } = await supabaseAdmin
        .from("qr_codes")
        .select("id, user_id")
        .eq("id", qrCodeId)
        .eq("user_id", auth.userId)
        .single();

    if (qrErr || !qr) {
        return NextResponse.json({ error: "QR code not found" }, { status: 404 });
    }

    // Rename
    if (name) {
        await supabaseAdmin
            .from("qr_codes")
            .update({ name })
            .eq("id", qrCodeId);
    }

    // Add holdings
    if (addHoldingIds && Array.isArray(addHoldingIds) && addHoldingIds.length > 0) {
        const { data: holdings } = await supabaseAdmin
            .from("vault_holdings")
            .select("id, status")
            .eq("user_id", auth.userId)
            .in("id", addHoldingIds)
            .eq("status", "pending_authentication");

        if (holdings && holdings.length > 0) {
            const validIds = holdings.map((h) => h.id);
            const junctionRows = validIds.map((hId: string) => ({
                qr_code_id: qrCodeId,
                holding_id: hId,
            }));

            await supabaseAdmin
                .from("qr_code_holdings")
                .upsert(junctionRows, { onConflict: "qr_code_id,holding_id" });

            await supabaseAdmin
                .from("vault_holdings")
                .update({ status: "shipped" })
                .in("id", validIds)
                .eq("user_id", auth.userId);
        }
    }

    // Remove holdings
    if (removeHoldingIds && Array.isArray(removeHoldingIds) && removeHoldingIds.length > 0) {
        await supabaseAdmin
            .from("qr_code_holdings")
            .delete()
            .eq("qr_code_id", qrCodeId)
            .in("holding_id", removeHoldingIds);

        // Revert status back to pending_authentication
        await supabaseAdmin
            .from("vault_holdings")
            .update({ status: "pending_authentication" })
            .in("id", removeHoldingIds)
            .eq("user_id", auth.userId)
            .eq("status", "shipped");
    }

    return NextResponse.json({ success: true });
}

/**
 * DELETE /api/qr-codes
 * Delete a QR code and revert holdings to pending_authentication.
 * Body: { qrCodeId }
 */
export async function DELETE(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { qrCodeId } = body;

    if (!qrCodeId) {
        return NextResponse.json({ error: "qrCodeId is required" }, { status: 400 });
    }

    // Get holding IDs before deleting
    const { data: junctions } = await supabaseAdmin
        .from("qr_code_holdings")
        .select("holding_id")
        .eq("qr_code_id", qrCodeId);

    const holdingIds = (junctions || []).map((j) => j.holding_id);

    // Verify ownership
    const { data: qr } = await supabaseAdmin
        .from("qr_codes")
        .select("id")
        .eq("id", qrCodeId)
        .eq("user_id", auth.userId)
        .single();

    if (!qr) {
        return NextResponse.json({ error: "QR code not found" }, { status: 404 });
    }

    // Delete QR code (cascades to junction table)
    await supabaseAdmin
        .from("qr_codes")
        .delete()
        .eq("id", qrCodeId);

    // Revert holdings to pending
    if (holdingIds.length > 0) {
        await supabaseAdmin
            .from("vault_holdings")
            .update({ status: "pending_authentication" })
            .in("id", holdingIds)
            .eq("user_id", auth.userId)
            .eq("status", "shipped");
    }

    return NextResponse.json({ success: true });
}
