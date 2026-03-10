"use client";

/**
 * TASH — Withdraw Funds Page
 *
 * 2-stage flow:
 *   1. amount  — Preset pills + custom input
 *   2. success — Withdrawal initiated, link to history
 */

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { CheckCircle, AlertCircle, Loader2, ArrowLeft, ExternalLink } from "lucide-react";
import { colors, layout } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { VerificationGate } from "@/components/auth/VerificationGate";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type Stage = "amount" | "success";

const PRESETS = [50, 100, 250, 500, 1_000, 2_500];
const MIN = 1;
const MAX = 10_000;

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────

export default function WithdrawPage() {
    const [stage, setStage] = useState<Stage>("amount");
    const [amount, setAmount] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resolutionLoading, setResolutionLoading] = useState(false);
    const { user, updateBalance, session, refreshProfile } = useAuth();

    // ── Remediation Link ──────────────────────────────────
    const handleResolveStripe = useCallback(async () => {
        if (!user) return;
        setResolutionLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.id,
                    email: user.email,
                    returnTo: "/withdraw"
                }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                setError(data.error || "Could not generate resolution link");
            }
        } catch {
            setError("Failed to connect to Stripe");
        } finally {
            setResolutionLoading(false);
        }
    }, [user]);

    const handleSync = useCallback(async () => {
        setLoading(true); // Reuse loading for sync
        setError(null);
        try {
            const res = await fetch("/api/connect/sync", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session?.access_token}`
                },
            });
            const data = await res.json();
            if (data.stripeOnboardingComplete) {
                await refreshProfile();
            } else {
                setError(data.message || "Stripe says you still have requirements to complete.");
            }
        } catch {
            setError("Failed to sync status.");
        } finally {
            setLoading(false);
        }
    }, [session, refreshProfile]);

    // ── Automatic Sync ────────────────────────────────────
    // Refresh profile and check Stripe status automatically
    useEffect(() => {
        if (!user || !session) return;

        // 1. If currently showing an error, or Stripe onboarding looks incomplete
        // we trigger a sync.
        if (error || (!user.stripeOnboardingComplete && user.stripeAccountId)) {
            handleSync();
        } else {
            // Otherwise just a regular profile refresh
            refreshProfile();
        }
    }, [user?.id, user?.stripeOnboardingComplete, session]);

    // ── Amount → Withdraw API ─────────────────────────────
    const handleWithdraw = useCallback(async (amt: number) => {
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/withdraw", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    type: "cash",
                    amountCents: Math.round(amt * 100),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Failed to process withdrawal");
                return;
            }
            setAmount(amt);
            setStage("success");
            // Update local wallet balance
            updateBalance(-amt);
        } catch {
            setError("Network error — please try again");
        } finally {
            setLoading(false);
        }
    }, [session, updateBalance]);

    // ─────────────────────────────────────────────────────────
    // Layout
    // ─────────────────────────────────────────────────────────

    const pageStyle: React.CSSProperties = {
        minHeight: `calc(100dvh - ${layout.chromeHeight})`,
        background: colors.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
    };

    const cardStyle: React.CSSProperties = {
        width: "100%",
        maxWidth: 480,
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 40,
    };


    return (
        <div style={pageStyle}>
            <div style={cardStyle}>
                <VerificationGate>
                    {stage === "amount" && (
                        <AmountStage
                            onContinue={handleWithdraw}
                            onResolve={handleResolveStripe}
                            availableBalance={user?.withdrawableBalance ?? 0}
                            loading={loading}
                            resolutionLoading={resolutionLoading}
                            error={error}
                        />
                    )}

                    {stage === "success" && amount != null && (
                        <SuccessStage
                            amount={amount}
                            balance={user?.withdrawableBalance ?? 0}
                        />
                    )}
                </VerificationGate>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// Stage 1 — Amount
// ─────────────────────────────────────────────────────────

function AmountStage({
    onContinue,
    onResolve,
    availableBalance,
    loading,
    resolutionLoading,
    error,
}: {
    onContinue: (amount: number) => void;
    onResolve: () => void;
    availableBalance: number;
    loading: boolean;
    resolutionLoading: boolean;
    error: string | null;
}) {
    const [selected, setSelected] = useState<number | null>(null);
    const [custom, setCustom] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);

    function getAmount(): number | null {
        if (custom !== "") {
            const val = parseFloat(custom.replace(/[^0-9.]/g, ""));
            return isNaN(val) ? null : val;
        }
        return selected;
    }

    function validate(): boolean {
        const amt = getAmount();
        if (amt == null) {
            setValidationError("Please select or enter an amount");
            return false;
        }
        if (amt < MIN) {
            setValidationError(`Minimum withdrawal is ${formatCurrency(MIN)}`);
            return false;
        }
        if (amt > MAX) {
            setValidationError(`Maximum withdrawal is ${formatCurrency(MAX)}`);
            return false;
        }
        if (amt > availableBalance) {
            setValidationError(`Insufficient funds. Your balance is ${formatCurrency(availableBalance)}`);
            return false;
        }
        setValidationError(null);
        return true;
    }

    function handleContinue() {
        if (!validate()) return;
        const amt = getAmount()!;
        onContinue(amt);
    }

    function handleCustomChange(val: string) {
        setCustom(val);
        setSelected(null);
        setValidationError(null);
    }

    const displayError = validationError ?? error;
    const amt = getAmount();
    const canContinue = amt != null && amt >= MIN && amt <= MAX && amt <= availableBalance && !loading;

    return (
        <>
            {/* Header */}
            <div style={{ paddingTop: 32, paddingBottom: 24 }}>
                <h1
                    style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: colors.textPrimary,
                        letterSpacing: "-0.02em",
                        margin: 0,
                    }}
                >
                    Withdraw Funds
                </h1>
                <p style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, margin: "4px 0 0" }}>
                    Moves funds to your linked bank account
                </p>
            </div>

            {/* Balance display */}
            <div
                style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    padding: "16px",
                    marginBottom: 24,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                }}
            >
                <div>
                    <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: colors.textMuted, margin: "0 0 2px" }}>
                        Available to Withdraw
                    </p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
                        {formatCurrency(availableBalance)}
                    </p>
                </div>
                <Link href="/deposit" style={{ fontSize: 12, color: colors.green, fontWeight: 600, textDecoration: "none" }}>
                    Add Funds
                </Link>
            </div>


            {/* Error banner */}
            {displayError && (
                <div
                    style={{
                        background: "rgba(255,80,0,0.1)",
                        border: `1px solid ${colors.red}44`,
                        borderRadius: 12,
                        padding: "14px",
                        marginBottom: 16,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <AlertCircle size={16} style={{ color: colors.red, flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, color: colors.red, lineHeight: 1.4, display: "block" }}>
                                {displayError}
                            </span>

                            {/* Remediation Buttons */}
                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                <button
                                    onClick={onResolve}
                                    disabled={resolutionLoading}
                                    style={{
                                        padding: "6px 16px",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        background: colors.red,
                                        color: "#fff",
                                        border: "none",
                                        cursor: resolutionLoading ? "not-allowed" : "pointer",
                                    }}
                                >
                                    {resolutionLoading ? "Loading..." : "Resolve on Stripe →"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Preset pills */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                    marginBottom: 16,
                }}
            >
                {PRESETS.map((preset) => {
                    const active = selected === preset && custom === "";
                    const disabled = preset > availableBalance;
                    return (
                        <button
                            key={preset}
                            disabled={disabled}
                            onClick={() => {
                                setSelected(preset);
                                setCustom("");
                                setValidationError(null);
                            }}
                            style={{
                                padding: "12px 0",
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: disabled ? "not-allowed" : "pointer",
                                border: `1px solid ${active ? colors.green : colors.border}`,
                                background: active ? colors.greenMuted : colors.surface,
                                color: active ? colors.green : disabled ? colors.textMuted : colors.textSecondary,
                                opacity: disabled ? 0.5 : 1,
                                transition: "all 0.15s",
                            }}
                        >
                            {formatCurrency(preset, { decimals: 0 })}
                        </button>
                    );
                })}
            </div>

            {/* Custom amount input */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    background: colors.surface,
                    border: `1px solid ${custom !== "" ? colors.green : colors.border}`,
                    borderRadius: 10,
                    padding: "0 14px",
                    marginBottom: 24,
                    transition: "border-color 0.15s",
                }}
            >
                <span
                    style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: custom !== "" ? colors.textPrimary : colors.textMuted,
                        marginRight: 4,
                        userSelect: "none",
                    }}
                >
                    $
                </span>
                <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Custom amount"
                    value={custom}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    min={MIN}
                    max={MAX}
                    style={{
                        flex: 1,
                        padding: "14px 0",
                        fontSize: 16,
                        fontWeight: 500,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: colors.textPrimary,
                        caretColor: colors.green,
                    }}
                />
                {custom !== "" && (
                    <button
                        onClick={() => { setCustom(""); setValidationError(null); }}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: colors.textMuted,
                            fontSize: 18,
                            lineHeight: 1,
                            padding: "0 0 0 8px",
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Continue button */}
            <button
                onClick={handleContinue}
                disabled={!canContinue}
                style={{
                    width: "100%",
                    padding: "14px 0",
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: canContinue ? "pointer" : "not-allowed",
                    border: "none",
                    background: canContinue ? colors.green : colors.surface,
                    color: canContinue ? colors.textInverse : colors.textMuted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "all 0.15s",
                }}
            >
                {loading ? (
                    <>
                        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                        Processing withdrawal…
                    </>
                ) : (
                    <>Confirm Withdrawal {amt != null && amt >= MIN ? `— ${formatCurrency(amt)}` : ""} →</>
                )}
            </button>

            <div style={{ marginTop: 16, textAlign: "center" }}>
                <p style={{ fontSize: 12, color: colors.textMuted }}>
                    Withdrawals are processed instantly but may take up to 24 hours to appear in your bank account depending on your bank.
                </p>
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </>
    );
}

// ─────────────────────────────────────────────────────────
// Stage 2 — Success
// ─────────────────────────────────────────────────────────

function SuccessStage({
    amount,
    balance,
}: {
    amount: number;
    balance: number;
}) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                paddingTop: 60,
                gap: 16,
            }}
        >
            <CheckCircle
                size={64}
                strokeWidth={1.5}
                style={{ color: colors.green }}
            />

            <div>
                <h2
                    style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: colors.textPrimary,
                        margin: 0,
                        letterSpacing: "-0.02em",
                    }}
                >
                    Withdrawal Initiated
                </h2>
                <p style={{ fontSize: 15, color: colors.textSecondary, marginTop: 8 }}>
                    <strong style={{ color: colors.textPrimary }}>{formatCurrency(amount)}</strong>{" "}
                    is on its way to your bank
                </p>
            </div>

            {/* Balance display */}
            <div
                style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    padding: "16px 24px",
                    marginTop: 4,
                    minWidth: 220,
                }}
            >
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.textMuted, margin: "0 0 4px" }}>
                    Remaining Balance
                </p>
                <p style={{ fontSize: 28, fontWeight: 700, color: colors.textPrimary, margin: 0, letterSpacing: "-0.02em" }}>
                    {formatCurrency(balance)}
                </p>
            </div>

            <Link
                href="/"
                style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 340,
                    marginTop: 16,
                    padding: "14px 0",
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: "none",
                    background: colors.green,
                    color: colors.textInverse,
                    textDecoration: "none",
                    textAlign: "center",
                }}
            >
                Back to Dashboard →
            </Link>

            <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    width: "100%",
                    maxWidth: 340,
                    padding: "12px 0",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${colors.border}`,
                    background: "transparent",
                    color: colors.textSecondary,
                    textDecoration: "none"
                }}
            >
                View on Stripe <ExternalLink size={14} />
            </a>
        </div>
    );
}
