"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiPost } from "@/lib/api";
import { colors } from "@/lib/theme";

interface VerificationGateProps {
    children: React.ReactNode;
}

/**
 * VerificationGate — Protects financial features until Stripe onboarding is 100% complete.
 * Wraps sensitive pages (Deposit, Withdraw) and components (TradePanel).
 */
export function VerificationGate({ children }: VerificationGateProps) {
    const { isAuthenticated, user, refreshProfile } = useAuth();
    const pathname = usePathname();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);
    const syncAttemptedRef = useRef(false);

    // 3. Not verified? Show the "Setup Required" screen
    const handleSync = async () => {
        setIsSyncing(true);
        setSyncMessage(null);
        try {
            // Note: API returns stripeOnboardingComplete
            const data = await apiPost<{ stripeOnboardingComplete?: boolean, message?: string }>("/api/connect/sync", {});

            if (data.stripeOnboardingComplete) {
                setSyncMessage("Verification complete! Please refresh the page to continue.");
                await refreshProfile();
            } else {
                setSyncMessage(data.message || "Still pending. Stripe might still be processing your information.");
            }
        } catch (err) {
            setSyncMessage("Failed to sync. Please try again.");
        } finally {
            setIsSyncing(false);
        }
    };

    // ── Automatic Sync ────────────────────────────────────
    useEffect(() => {
        // Only trigger automatically if they have an account but aren't marked complete
        if (isAuthenticated && user?.stripeAccountId && !user?.stripeOnboardingComplete && !syncAttemptedRef.current) {
            syncAttemptedRef.current = true;
            handleSync();
        }
    }, [isAuthenticated, user?.stripeAccountId, user?.stripeOnboardingComplete]);

    // 1. Not logged in? Show nothing (handled by page-level auth checks usually)
    if (!isAuthenticated) return null;

    // 2. Verified? Show the protected content
    if (user?.stripeOnboardingComplete) {
        return <>{children}</>;
    }

    return (
        <div
            className="flex flex-col items-center justify-center p-8 text-center"
            style={{ minHeight: "60vh", background: colors.background }}
        >
            <div
                className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: `${colors.gold}15`, border: `1px solid ${colors.gold}30` }}
            >
                <ShieldCheck size={32} style={{ color: colors.gold }} />
            </div>

            <h2 className="text-[22px] font-bold tracking-tight mb-2" style={{ color: colors.textPrimary }}>
                Financial Setup Required
            </h2>
            <p className="max-w-[340px] text-[14px] leading-relaxed mb-8" style={{ color: colors.textSecondary }}>
                To maintain a secure marketplace, we require all users to verify their identity via Stripe before making deposits, withdrawals, or trades.
            </p>

            <div className="flex flex-col w-full max-w-[320px] gap-3">
                <Link
                    href={`/wallet-setup${pathname ? `?returnTo=${encodeURIComponent(pathname)}` : ""}`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[14px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: colors.green, color: colors.textInverse }}
                >
                    <span>{user?.stripeAccountId ? "Continue Setup" : "Setup Financial Wallet"}</span>
                    <ArrowRight size={16} />
                </Link>

                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border py-4 text-[13px] font-semibold transition-colors hover:bg-white/5"
                    style={{ borderColor: colors.border, color: colors.textSecondary }}
                >
                    <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                    <span>{isSyncing ? "Syncing..." : "Sync Status"}</span>
                </button>
            </div>

            {syncMessage && (
                <div className="mt-6 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: colors.gold }}>
                        <AlertCircle size={14} />
                        <span>{syncMessage}</span>
                    </div>
                </div>
            )}

            <p className="mt-12 max-w-[400px] text-[11px] font-medium leading-relaxed" style={{ color: colors.textMuted }}>
                Note: Stripe verification is usually instant, but can sometimes take a few minutes (or up to 24 hours) to fully activate. If you just finished setup, please wait a moment then try syncing.
            </p>
        </div>
    );
}
