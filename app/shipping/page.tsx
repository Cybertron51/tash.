"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Truck, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePortfolio } from "@/lib/portfolio-context";
import { SignInModal } from "@/components/auth/SignInModal";
import { updateVaultHoldingStatus } from "@/lib/db/vault";
import { colors, layout, psaGradeColor } from "@/lib/theme";

export default function ShippingPage() {
    const { isAuthenticated } = useAuth();
    const { holdings, updateHolding } = usePortfolio();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [showSignIn, setShowSignIn] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        const preSelected = searchParams.get("selected");
        return preSelected ? new Set([preSelected]) : new Set();
    });
    const [submitting, setSubmitting] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [email, setEmail] = useState("");

    const pendingHoldings = holdings.filter((h) => h.status === "pending_authentication");

    function toggleCard(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleShip() {
        if (selectedIds.size === 0) return;
        setSubmitting(true);
        try {
            const ids = Array.from(selectedIds);
            await Promise.all(
                ids.map((id) => updateVaultHoldingStatus(id, { status: "shipped" }))
            );
            ids.forEach((id) => updateHolding(id, { status: "shipped" }));
            setConfirmed(true);
        } catch (err: any) {
            alert(err.message || "Failed to update shipment status");
        }
        setSubmitting(false);
    }

    if (!isAuthenticated) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-4"
                style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}
            >
                <div style={{ padding: 32, borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.surfaceOverlay, textAlign: "center", maxWidth: 400 }}>
                    <h2 style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign In Required</h2>
                    <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>You must be logged in to ship cards.</p>
                    <button
                        onClick={() => setShowSignIn(true)}
                        style={{ width: "100%", background: colors.green, color: colors.background, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}
                    >
                        Sign In / Sign Up
                    </button>
                </div>
                {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
            </div>
        );
    }

    if (confirmed) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-6"
                style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background, padding: 32 }}
            >
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 440 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: colors.greenMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <Check size={24} style={{ color: colors.green }} />
                    </div>
                    <h2 style={{ color: colors.textPrimary, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Cards Marked as Shipped</h2>
                    <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
                        Your {selectedIds.size} card{selectedIds.size !== 1 ? "s have" : " has"} been marked as shipped. Once we receive and verify them, they will become tradable on the market.
                    </p>
                    <button
                        onClick={() => router.push("/portfolio")}
                        style={{ width: "100%", background: colors.green, color: colors.textInverse, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}
                    >
                        Back to Portfolio
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}>
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
                {/* Header */}
                <div style={{ marginBottom: 32 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.greenMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Truck size={20} style={{ color: colors.green }} />
                        </div>
                        <h1 style={{ color: colors.textPrimary, fontSize: 24, fontWeight: 700 }}>Ship to Vault</h1>
                    </div>
                    <p style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
                        Ship your cards to the Tash Vault for verification. Once received and authenticated, your cards will become instantly tradable on the market.
                    </p>
                </div>

                {/* Shipping address */}
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
                    <p style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                        Shipping Address
                    </p>
                    <div style={{ background: colors.background, borderRadius: 8, padding: "14px 18px", border: `1px solid ${colors.borderSubtle}` }}>
                        <p style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 700, fontFamily: "monospace", margin: 0 }}>TASH VAULT INGESTION</p>
                        <p style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "monospace", margin: "4px 0 0" }}>2522 Dwight Way</p>
                        <p style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "monospace", margin: "4px 0 0" }}>Berkeley, CA 94704</p>
                    </div>
                    <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 14, lineHeight: 1.5 }}>
                        Please pack securely with a bubble mailer and tracking number. We recommend insuring packages over $1,000.
                    </p>
                </div>

                {/* Email — required so we can match the package to the sender */}
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
                    <label
                        htmlFor="sender-email"
                        style={{ display: "block", color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}
                    >
                        Your Email
                    </label>
                    <input
                        id="sender-email"
                        type="email"
                        required
                        placeholder="you@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{
                            width: "100%",
                            boxSizing: "border-box",
                            background: colors.background,
                            border: `1px solid ${colors.borderSubtle}`,
                            borderRadius: 8,
                            padding: "12px 14px",
                            color: colors.textPrimary,
                            fontSize: 14,
                            outline: "none",
                            fontFamily: "inherit",
                        }}
                    />
                    <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
                        Please write this email on a slip of paper and include it inside the package so we can match it to your account.
                    </p>
                </div>

                {/* Card selection */}
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                            <p style={{ color: colors.textPrimary, fontSize: 16, fontWeight: 700 }}>Select Cards to Ship</p>
                            <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                                Choose from your pending cards ({pendingHoldings.length} available)
                            </p>
                        </div>
                        {selectedIds.size > 0 && (
                            <span style={{ color: colors.green, fontSize: 12, fontWeight: 600 }}>
                                {selectedIds.size} selected
                            </span>
                        )}
                    </div>

                    {pendingHoldings.length === 0 ? (
                        <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                            <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500, marginBottom: 8 }}>No pending cards to ship.</p>
                            <p style={{ fontSize: 12, color: colors.textMuted }}>Upload cards first via the Upload button, then come back here.</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {pendingHoldings.map((h) => {
                                const isSelected = selectedIds.has(h.id);
                                const gradeColor = psaGradeColor[h.grade as 8 | 9 | 10] ?? colors.textSecondary;
                                return (
                                    <button
                                        key={h.id}
                                        onClick={() => toggleCard(h.id)}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 14,
                                            padding: 14,
                                            borderRadius: 12,
                                            border: `1px solid ${isSelected ? colors.green : colors.border}`,
                                            background: isSelected ? `${colors.green}08` : colors.surface,
                                            cursor: "pointer",
                                            textAlign: "left",
                                            transition: "all 0.15s",
                                            width: "100%",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 22,
                                                height: 22,
                                                borderRadius: 6,
                                                border: `2px solid ${isSelected ? colors.green : colors.border}`,
                                                background: isSelected ? colors.green : "transparent",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                                transition: "all 0.15s",
                                            }}
                                        >
                                            {isSelected && <Check size={14} style={{ color: colors.textInverse }} strokeWidth={3} />}
                                        </div>

                                        <div style={{ width: 40, height: 56, borderRadius: 4, overflow: "hidden", border: `1px solid ${colors.border}`, background: colors.surface, flexShrink: 0 }}>
                                            <Image
                                                src={h.imageUrl || `/cards/${h.symbol}.svg`}
                                                alt={h.name}
                                                width={40}
                                                height={56}
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                unoptimized
                                            />
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {h.name}
                                            </p>
                                            <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                                {h.set}
                                            </p>
                                        </div>

                                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                                            <span
                                                style={{
                                                    display: "inline-block",
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    padding: "2px 8px",
                                                    borderRadius: 5,
                                                    background: `${gradeColor}18`,
                                                    border: `1px solid ${gradeColor}44`,
                                                    color: gradeColor,
                                                }}
                                            >
                                                PSA {h.grade}
                                            </span>
                                            {h.certNumber && (
                                                <p style={{ color: colors.textMuted, fontSize: 10, marginTop: 4, fontFamily: "monospace" }}>
                                                    {h.certNumber}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {pendingHoldings.length > 0 && (
                        <button
                            onClick={handleShip}
                            disabled={selectedIds.size === 0 || submitting || !email.trim()}
                            style={{
                                width: "100%",
                                marginTop: 20,
                                padding: "14px 24px",
                                borderRadius: 12,
                                fontSize: 14,
                                fontWeight: 700,
                                background: selectedIds.size > 0 && email.trim() ? colors.green : colors.surface,
                                color: selectedIds.size > 0 && email.trim() ? colors.textInverse : colors.textMuted,
                                border: `1px solid ${selectedIds.size > 0 && email.trim() ? colors.green : colors.border}`,
                                cursor: selectedIds.size > 0 && !submitting && email.trim() ? "pointer" : "not-allowed",
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                            }}
                        >
                            {submitting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                            I Have Shipped {selectedIds.size > 0 ? `${selectedIds.size} Card${selectedIds.size !== 1 ? "s" : ""}` : "Cards"}
                        </button>
                    )}
                </div>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
