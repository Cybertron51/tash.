/**
 * TASH — Supabase Admin Client (Service Role)
 *
 * For server-side operations that need to bypass RLS.
 * NEVER import this from client-side code.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin: SupabaseClient | null =
    url && serviceKey ? createClient(url, serviceKey) : null;

/**
 * Verify a JWT from the Authorization header.
 * Returns { userId, email } on success, or null if invalid.
 */
export async function verifyAuth(
    req: NextRequest
): Promise<{ userId: string; email: string; emailConfirmed: boolean } | null> {
    if (!supabaseAdmin) return null;

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7);

    const {
        data: { user },
        error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) return null;

    return { userId: user.id, email: user.email ?? "", emailConfirmed: !!user.email_confirmed_at };
}

/**
 * Helper: return a 401 JSON response.
 */
export function unauthorized() {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
