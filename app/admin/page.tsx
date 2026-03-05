"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { colors, layout } from "@/lib/theme";
import { Loader2, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SignInModal } from "@/components/auth/SignInModal";

export default function AdminPage() {
    const { isAuthenticated, user } = useAuth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [shippedItems, setShippedItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSignIn, setShowSignIn] = useState(false);

    useEffect(() => {
        async function fetchShipped() {
            setIsLoading(true);
            try {
                const data = await apiGet<any[]>(`/api/admin/approve?t=${Date.now()}`);
                setShippedItems(data || []);
            } catch (err: any) {
                // If it's a 403, fail silently for non-admins so we don't spam alerts.
                if (!err.message.includes("403")) {
                    alert(`Error loading admin data: ${err.message}`);
                }
                setShippedItems([]);
            }
            setIsLoading(false);
        }

        if (isAuthenticated && user?.email === "derekyp9@gmail.com") fetchShipped();
        else setIsLoading(false);
    }, [isAuthenticated, user?.email]);

    async function approveItem(id: string) {
        // Optimistic UI
        setShippedItems((prev) => prev.filter((item) => item.id !== id));

        try {
            await apiPatch("/api/admin/approve", { holdingId: id });
        } catch (err) {
            console.error("Failed to approve:", err);
        }
    }

    if ((!isAuthenticated || user?.email !== "derekyp9@gmail.com") && !isLoading) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-4"
                style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}
            >
                <div style={{ padding: 32, borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.surfaceOverlay, textAlign: "center", maxWidth: 400 }}>
                    <h2 style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Admin Access Required</h2>
                    <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>You must be logged in as an administrator to access this dashboard.</p>
                    {!isAuthenticated && (
                        <button
                            onClick={() => setShowSignIn(true)}
                            style={{ width: "100%", background: colors.green, color: colors.background, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, transition: "transform 0.15s" }}
                        >
                            Sign In
                        </button>
                    )}
                </div>
                {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
            </div>
        );
    }

    return (
        <div style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background, padding: 32 }}>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.textPrimary, marginBottom: 8 }}>
                    Intake Administration
                </h1>
                <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 32 }}>
                    Approve physical assets that have been received via mail to immediately grant digital trading rights to the owner.
                </p>

                {isLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
                        <Loader2 size={24} style={{ color: colors.textMuted, animation: "spin 1s linear infinite" }} />
                    </div>
                ) : shippedItems.length === 0 ? (
                    <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                        <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500 }}>No shipped items pending approval.</p>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {shippedItems.map((item) => (
                            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 16, background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>

                                {/* Images Grid */}
                                <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                                    {/* User's Raw Scan */}
                                    <div>
                                        <p style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Raw Upload</p>
                                        <div style={{ width: 140, height: 196, borderRadius: 8, background: colors.surface, overflow: "hidden", border: `1px solid ${colors.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            {item.raw_image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={item.raw_image_url} alt="Raw Scan" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                                            ) : (
                                                <p style={{ fontSize: 11, color: colors.textMuted }}>No Image</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* PSA Official Image */}
                                    <div>
                                        <p style={{ fontSize: 11, fontWeight: 600, color: colors.gold, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>PSA Record</p>
                                        <div style={{ width: 140, height: 196, borderRadius: 8, background: colors.surface, overflow: "hidden", border: `1px solid ${colors.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            {item.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={item.image_url} alt="PSA Match" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                                            ) : (
                                                <p style={{ fontSize: 11, color: colors.textMuted }}>No Match</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Details */}
                                <div style={{ flex: 1, padding: '8px 0' }}>
                                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                                        <div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                <span style={{ fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>{item.name || "Unknown Card"}</span>
                                                <span style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    padding: "2px 6px",
                                                    borderRadius: 4,
                                                    background: item.status === "shipped" ? "rgba(245,200,66,0.15)" : item.status === "returning" ? "rgba(59,130,246,0.15)" : "rgba(245,130,66,0.15)",
                                                    color: item.status === "shipped" ? "#F5C842" : item.status === "returning" ? "#3B82F6" : "#F58242",
                                                    textTransform: "uppercase"
                                                }}>
                                                    {item.status === "shipped" ? "Shipped" : item.status === "returning" ? "Returning" : "Pending"}
                                                </span>
                                            </div>
                                            <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>
                                                {item.set || "Unknown Set"}
                                            </p>
                                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                                {item.grade && (
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: colors.green, background: `${colors.green}15`, padding: '2px 8px', borderRadius: 4 }}>
                                                        PSA {item.grade}
                                                    </span>
                                                )}
                                                {item.cert_number && (
                                                    <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: "monospace" }}>
                                                        Cert: {item.cert_number}
                                                    </span>
                                                )}
                                                <span style={{ fontSize: 12, color: colors.textMuted }}>
                                                    Symbol: <span style={{ fontWeight: 600 }}>{item.symbol}</span>
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{ textAlign: "right" }}>
                                            <p style={{ fontSize: 12, color: colors.textSecondary, margin: "0 0 4px 0" }}>Declared Value</p>
                                            <p style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>{formatCurrency(Number(item.acquisition_price))}</p>
                                        </div>
                                    </div>

                                    <div style={{ borderTop: `1px solid ${colors.borderSubtle}`, paddingTop: 12, marginTop: 12 }}>
                                        <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0 }}>
                                            Owner: <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{item.profiles?.name || item.profiles?.email || "Unknown"}</span>
                                        </p>
                                        {item.status === "returning" && item.shipping_address && (
                                            <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 8, fontStyle: "italic" }}>
                                                Ship to: <span style={{ color: colors.textPrimary }}>{item.shipping_address}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                {item.status !== "returning" && (
                                    <button
                                        onClick={() => approveItem(item.id)}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            padding: "10px 16px",
                                            borderRadius: 8,
                                            background: colors.green,
                                            color: colors.textInverse,
                                            border: "none",
                                            fontWeight: 700,
                                            fontSize: 13,
                                            cursor: "pointer",
                                            transition: "transform 0.1s",
                                        }}
                                        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                                        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                                        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                                    >
                                        <Check size={14} strokeWidth={3} />
                                        Approve & Vault
                                    </button>
                                )}

                            </div>
                        ))}
                    </div>
                )}
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
