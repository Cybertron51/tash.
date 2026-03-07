import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

/**
 * DELETE /api/user/delete — Deletes the authenticated user's account.
 */
export async function DELETE(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    // Use admin client to delete user from Supabase Auth
    // This will cascade to the `profiles` table and other related tables
    // because of the `ON DELETE CASCADE` foreign key constraints in schema.sql.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(auth.userId);

    if (error) {
        console.error("Error deleting user:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
