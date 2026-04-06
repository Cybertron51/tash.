import { NextRequest, NextResponse } from "next/server";

/**
 * TASH — Route Protection Middleware
 *
 * Rules:
 *  1. Public routes (/, /privacy, /auth/*, /api/*) — always accessible.
 *  2. /sign-up — requires a `referral_code` cookie (set by the landing page gate).
 *  3. All other app routes — require an active Supabase session cookie.
 *
 * Supabase v2 stores the session cookie as:
 *   sb-<project-ref>-auth-token
 * where <project-ref> is the hostname of NEXT_PUBLIC_SUPABASE_URL.
 * For local dev (http://127.0.0.1:54321) that becomes "127".
 * For production (https://tsymobzdyfepaphtmdpv.supabase.co) that becomes "tsymobzdyfepaphtmdpv".
 *
 * We derive this at module load time from the env var so the check is always exact.
 */

// ── Derive exact Supabase auth cookie names ──────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Extract just the first hostname segment, which Supabase uses as the project ref.
// e.g. "https://tsymobzdyfepaphtmdpv.supabase.co" → "tsymobzdyfepaphtmdpv"
//      "http://127.0.0.1:54321"                  → "127"
function deriveProjectRef(url: string): string {
    try {
        const hostname = new URL(url).hostname; // e.g. "tsymobzdyfepaphtmdpv.supabase.co" or "127.0.0.1"
        return hostname.split(".")[0];           // e.g. "tsymobzdyfepaphtmdpv" or "127"
    } catch {
        return "";
    }
}

const PROJECT_REF = deriveProjectRef(SUPABASE_URL);

// Supabase writes the token cookie in chunks when it's large:
//   sb-<ref>-auth-token     — single cookie (short tokens)
//   sb-<ref>-auth-token.0   — first chunk (long tokens; presence means session exists)
const SESSION_COOKIE = `sb-${PROJECT_REF}-auth-token`;
const SESSION_COOKIE_CHUNK = `sb-${PROJECT_REF}-auth-token.0`;

// ── Public route allowlist ────────────────────────────────────────────────────
const PUBLIC_PREFIXES = ["/api/", "/auth/", "/privacy", "/_next/", "/favicon", "/cards/", "/mock_"];
const PUBLIC_EXACT = ["/", "/forgot-password"];

function isPublic(pathname: string): boolean {
    if (PUBLIC_EXACT.includes(pathname)) return true;
    return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function hasSupabaseSession(request: NextRequest): boolean {
    return (
        !!request.cookies.get(SESSION_COOKIE)?.value ||
        !!request.cookies.get(SESSION_COOKIE_CHUNK)?.value
    );
}

// ── Middleware ────────────────────────────────────────────────────────────────
export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Always allow public routes
    if (isPublic(pathname)) return NextResponse.next();

    // /sign-up: requires referral code cookie (set by landing page gate)
    if (pathname === "/sign-up") {
        const referralCode = request.cookies.get("referral_code")?.value;
        if (!referralCode) {
            return NextResponse.redirect(new URL("/", request.url));
        }
        return NextResponse.next();
    }

    // All other routes: require an active Supabase session
    if (!hasSupabaseSession(request)) {
        return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
