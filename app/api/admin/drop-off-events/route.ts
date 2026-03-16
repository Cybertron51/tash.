import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "derekyp9@gmail.com";

function isAdmin(email: string) {
    return email === ADMIN_EMAIL;
}

/**
 * GET /api/admin/drop-off-events
 * Public: fetch active drop-off events. Admin: fetch all.
 */
export async function GET(req: NextRequest) {
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const auth = await verifyAuth(req);
    const showAll = auth && isAdmin(auth.email);

    let query = supabaseAdmin
        .from("drop_off_events")
        .select("*")
        .order("date", { ascending: true });

    if (!showAll) {
        query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
}

/**
 * POST /api/admin/drop-off-events
 * Admin-only: create a new drop-off event.
 */
export async function POST(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth || !isAdmin(auth.email)) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { address, date, time_start, time_end, description } = body;

    if (!address || !date || !time_start || !time_end) {
        return NextResponse.json({ error: "address, date, time_start, time_end are required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("drop_off_events")
        .insert({ address, date, time_start, time_end, description: description || null })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
}

/**
 * PATCH /api/admin/drop-off-events
 * Admin-only: update a drop-off event.
 */
export async function PATCH(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth || !isAdmin(auth.email)) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { data, error } = await supabaseAdmin
        .from("drop_off_events")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

/**
 * DELETE /api/admin/drop-off-events
 * Admin-only: delete a drop-off event.
 */
export async function DELETE(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth || !isAdmin(auth.email)) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabaseAdmin
        .from("drop_off_events")
        .delete()
        .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
