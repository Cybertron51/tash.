import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 * Returns list of all users, their emails, and their last login.
 */
export async function GET(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (auth.email !== "derekyp9@gmail.com") {
        return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    try {
        // We keep `last_sign_in_at` from Supabase Auth,
        // but we display "Account Created" from `public.profiles.created_at`
        // so our `scripts/usertimestamps.csv` edits show up in the UI.
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const authUsers = data.users;
        const authUserIds = authUsers.map((u) => u.id);

        const { data: profileRows, error: profilesError } = await supabaseAdmin
            .from("profiles")
            .select("id, created_at")
            .in("id", authUserIds);

        if (profilesError) {
            // If profiles lookup fails, fall back to auth timestamps rather than breaking admin.
            console.warn("Failed to load profiles.created_at for admin users:", profilesError.message);
        }

        const profileById = new Map<string, string>();
        for (const p of profileRows ?? []) {
            if (p.id && p.created_at) profileById.set(p.id, p.created_at);
        }

        const users = authUsers.map((user) => {
            const profileCreatedAt = profileById.get(user.id);
            const created_at = profileCreatedAt ?? user.created_at;
            const last_login = user.last_sign_in_at || created_at;

            return {
                id: user.id,
                email: user.email,
                created_at,
                last_login,
            };
        });

        // Sort by last login descending
        users.sort((a, b) => new Date(b.last_login).getTime() - new Date(a.last_login).getTime());

        return NextResponse.json(users);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
