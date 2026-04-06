"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

// Routes that don't require onboarding
const PUBLIC_ROUTES = [
    "/",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/onboarding",
    "/auth/callback",
    "/auth/reset-password",
    "/market",
];

// Routes that are strictly public (no auth needed at all, but we watch them)
// Actually, market needs auth for trading, but not for viewing.
// The check: if authenticated, must have onboarded to use ANY protected route.
// If viewing market unauthenticated, that's fine.

export function GlobalRouteCheck({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user, isProfileComplete, session } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    const [isChecking, setIsChecking] = useState(true);

    const isAllowedRoute = PUBLIC_ROUTES.includes(pathname || "");
    const needsOnboarding = Boolean(
        isAuthenticated &&
            user &&
            !user.isAdmin &&
            !isAdminEmail(user.email) &&
            (!user.referralCodeId || !isProfileComplete)
    );

    useEffect(() => {
        if (session === undefined) return;

        if (needsOnboarding && !isAllowedRoute) {
            router.replace(`/onboarding?returnTo=${encodeURIComponent(pathname || "/")}`);
        } else {
            setIsChecking(false);
        }
    }, [isAuthenticated, user, isProfileComplete, pathname, router, session, needsOnboarding, isAllowedRoute]);

    if (session === undefined || (needsOnboarding && !isAllowedRoute)) {
        return null;
    }

    return <>{children}</>;
}
