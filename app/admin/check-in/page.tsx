"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X, Loader2, User, Package, ArrowLeft, PackageCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SignInModal } from "@/components/auth/SignInModal";
import { apiGet, apiPatch } from "@/lib/api";
import { colors } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";

interface Holding {
    id: string;
    junctionId: string;
    name: string;
    symbol: string;
    set: string;
    set_name: string;
    year: number;
    grade: number;
    psa_grade: number;
    cert_number: string;
    acquisition_price: number;
    status: string;
    image_url: string | null;
    raw_image_url: string | null;
}

interface QrBatch {
    id: string;
    name: string;
    type: string;
    status: string;
    created_at: string;
    user: {
        name: string | null;
        email: string | null;
        username: string | null;
    };
    holdings: Holding[];
}

function CheckInContent() {
    const { isAuthenticated, user } = useAuth();
    const searchParams = useSearchParams();
    const id = searchParams.get("id");

    const [showSignIn, setShowSignIn] = useState(false);
    const [batch, setBatch] = useState<QrBatch | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [receivingBatch, setReceivingBatch] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const isAdmin = user?.isAdmin;

    useEffect(() => {
        if (!isAuthenticated || !isAdmin || !id) {
            setIsLoading(false);
            return;
        }
        async function load() {
            try {
                const data = await apiGet<QrBatch>(`/api/admin/qr-codes?id=${id}`);
                setBatch(data);
            } catch (err: any) {
                if (err.message?.includes("404")) setNotFound(true);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [isAuthenticated, isAdmin, id]);

    async function markReceived() {
        if (!batch) return;
        setReceivingBatch(true);
        try {
            await apiPatch("/api/admin/qr-codes", { qrCodeId: batch.id, action: "receive" });
            setBatch((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    status: "received",
                    holdings: prev.holdings.map((h) =>
                        h.status === "drop_off" || h.status === "shipped" || h.status === "pending_authentication"
                            ? { ...h, status: "received" }
                            : h
                    ),
                };
            });
        } catch (err: any) {
            alert(`Failed to mark as received: ${err.message}`);
        } finally {
            setReceivingBatch(false);
        }
    }

    async function handleHolding(holdingId: string, action: "approve" | "disapprove") {
        setActionLoading(holdingId + action);
        try {
            await apiPatch("/api/admin/qr-codes", { holdingId, action });
            setBatch((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    holdings: prev.holdings.map((h) =>
                        h.id === holdingId
                            ? { ...h, status: action === "approve" ? "tradable" : "disapproved" }
                            : h
                    ),
                };
            });
        } catch (err: any) {
            alert(`Failed to ${action}: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    }

    const statusColor = (s: string) => {
        if (s === "tradable") return colors.green;
        if (s === "disapproved") return colors.red;
        if (s === "received") return "#3B82F6";
        return "#F5C842";
    };

    const statusBg = (s: string) => {
        if (s === "tradable") return colors.greenMuted;
        if (s === "disapproved") return "rgba(255,80,0,0.12)";
        if (s === "received") return "rgba(59,130,246,0.15)";
        return "rgba(245,200,66,0.15)";
    };

    if (!isAuthenticated) {
        return (
            <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 360, width: "100%" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <User size={24} style={{ color: "#3B82F6" }} />
                    </div>
                    <h2 style={{ color: colors.textPrimary, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Admin Sign In Required</h2>
                    <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
                        You must be signed in as an admin to access this check-in page.
                    </p>
                    <button
                        onClick={() => setShowSignIn(true)}
                        style={{ width: "100%", background: colors.green, color: colors.textInverse, padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}
                    >
                        Sign In
                    </button>
                </div>
                {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 360, width: "100%" }}>
                    <p style={{ color: colors.red, fontSize: 14, fontWeight: 600 }}>Access denied. Admin only.</p>
                </div>
            </div>
        );
    }

    if (!id) {
        return (
            <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 360, width: "100%" }}>
                    <p style={{ color: colors.textMuted, fontSize: 14 }}>No QR code ID provided.</p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={28} style={{ color: colors.green, animation: "spin 1s linear infinite" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (notFound || !batch) {
        return (
            <div style={{ minHeight: "100dvh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 360, width: "100%" }}>
                    <Package size={32} style={{ color: colors.textMuted, marginBottom: 12 }} />
                    <p style={{ color: colors.textPrimary, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Batch Not Found</p>
                    <p style={{ color: colors.textMuted, fontSize: 13 }}>This QR code does not match any submission.</p>
                </div>
            </div>
        );
    }

    const pendingCount = batch.holdings.filter((h) => h.status === "shipped").length;
    const approvedCount = batch.holdings.filter((h) => h.status === "tradable").length;
    const rejectedCount = batch.holdings.filter((h) => h.status === "disapproved").length;
    const isReceived = batch.status === "received" || batch.status === "completed";

    return (
        <div style={{ minHeight: "100dvh", background: colors.background, paddingBottom: 40 }}>
            {/* Header */}
            <div style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: "16px 20px", position: "sticky", top: 0, zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 600, margin: "0 auto" }}>
                    <a
                        href="/admin"
                        style={{ display: "flex", alignItems: "center", color: colors.textMuted, textDecoration: "none", flexShrink: 0 }}
                    >
                        <ArrowLeft size={20} />
                    </a>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={{ color: colors.textPrimary, fontSize: 16, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {batch.name}
                        </h1>
                        <p style={{ color: colors.textMuted, fontSize: 11, margin: 0 }}>
                            {new Date(batch.created_at).toLocaleDateString()} · {batch.holdings.length} card{batch.holdings.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                    <span style={{
                        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, textTransform: "uppercase",
                        background: statusBg(batch.status),
                        color: statusColor(batch.status),
                        flexShrink: 0,
                    }}>
                        {batch.status}
                    </span>
                </div>
            </div>

            <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px" }}>

                {/* User Identity Card */}
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                        Customer Identity
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: "50%", background: colors.greenMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `2px solid ${colors.green}` }}>
                            <User size={24} style={{ color: colors.green }} />
                        </div>
                        <div>
                            <p style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, margin: "0 0 2px" }}>
                                {batch.user?.name || batch.user?.username || "Unknown"}
                            </p>
                            <p style={{ color: colors.textSecondary, fontSize: 13, margin: 0 }}>
                                {batch.user?.email || "No email"}
                            </p>
                            {batch.user?.username && (
                                <p style={{ color: colors.textMuted, fontSize: 11, margin: "2px 0 0" }}>
                                    @{batch.user.username}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Summary stats + Receive button */}
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                        <div style={{ flex: 1, textAlign: "center", background: colors.surfaceOverlay, borderRadius: 10, padding: "12px 8px" }}>
                            <p style={{ fontSize: 22, fontWeight: 800, color: "#F5C842", margin: 0 }}>{pendingCount}</p>
                            <p style={{ fontSize: 10, color: colors.textMuted, margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pending</p>
                        </div>
                        <div style={{ flex: 1, textAlign: "center", background: colors.surfaceOverlay, borderRadius: 10, padding: "12px 8px" }}>
                            <p style={{ fontSize: 22, fontWeight: 800, color: colors.green, margin: 0 }}>{approvedCount}</p>
                            <p style={{ fontSize: 10, color: colors.textMuted, margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>Approved</p>
                        </div>
                        <div style={{ flex: 1, textAlign: "center", background: colors.surfaceOverlay, borderRadius: 10, padding: "12px 8px" }}>
                            <p style={{ fontSize: 22, fontWeight: 800, color: colors.red, margin: 0 }}>{rejectedCount}</p>
                            <p style={{ fontSize: 10, color: colors.textMuted, margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rejected</p>
                        </div>
                    </div>

                    {!isReceived ? (
                        <button
                            onClick={markReceived}
                            disabled={receivingBatch}
                            style={{
                                width: "100%",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                padding: "14px 16px", borderRadius: 10,
                                background: "rgba(59,130,246,0.15)", color: "#3B82F6",
                                border: "1px solid rgba(59,130,246,0.3)",
                                fontWeight: 700, fontSize: 14, cursor: "pointer",
                                opacity: receivingBatch ? 0.6 : 1,
                            }}
                        >
                            {receivingBatch ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <PackageCheck size={16} />}
                            Mark Batch as Received
                        </button>
                    ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px", borderRadius: 10, background: "rgba(59,130,246,0.10)" }}>
                            <PackageCheck size={16} style={{ color: "#3B82F6" }} />
                            <span style={{ color: "#3B82F6", fontWeight: 700, fontSize: 13 }}>Batch Received</span>
                        </div>
                    )}
                </div>

                {/* Cards */}
                <p style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Cards in Batch
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {batch.holdings.map((h) => {
                        const isApprovable = ["shipped", "received", "pending_authentication", "drop_off"].includes(h.status);
                        return (
                            <div
                                key={h.id}
                                style={{
                                    background: colors.surface,
                                    border: `1px solid ${isApprovable ? colors.border : statusColor(h.status) + "44"}`,
                                    borderRadius: 14,
                                    padding: 16,
                                    transition: "border-color 0.2s",
                                }}
                            >
                                <div style={{ display: "flex", gap: 12 }}>
                                    {/* Images */}
                                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                        <div>
                                            <p style={{ fontSize: 8, fontWeight: 700, color: colors.textMuted, marginBottom: 3, textTransform: "uppercase" }}>Raw</p>
                                            <div style={{ width: 60, height: 84, borderRadius: 6, background: colors.surfaceOverlay, overflow: "hidden", border: `1px solid ${colors.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                {h.raw_image_url ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={h.raw_image_url} alt="Raw" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                                                ) : (
                                                    <span style={{ fontSize: 8, color: colors.textMuted }}>N/A</span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 8, fontWeight: 700, color: colors.gold, marginBottom: 3, textTransform: "uppercase" }}>PSA</p>
                                            <div style={{ width: 60, height: 84, borderRadius: 6, background: colors.surfaceOverlay, overflow: "hidden", border: `1px solid ${colors.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                {h.image_url ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={h.image_url} alt="PSA" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                                                ) : (
                                                    <span style={{ fontSize: 8, color: colors.textMuted }}>N/A</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                            <p style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{h.name || "Unknown Card"}</p>
                                            <span style={{
                                                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
                                                background: statusBg(h.status), color: statusColor(h.status),
                                                flexShrink: 0, marginTop: 2,
                                            }}>
                                                {h.status}
                                            </span>
                                        </div>
                                        <p style={{ color: colors.textSecondary, fontSize: 11, margin: "0 0 6px" }}>{h.set || h.set_name}</p>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            {h.grade && (
                                                <span style={{ fontSize: 11, fontWeight: 700, color: h.grade === 10 ? colors.green : h.grade === 9 ? colors.gold : colors.textSecondary }}>
                                                    PSA {h.grade}
                                                </span>
                                            )}
                                            {h.cert_number && (
                                                <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: "monospace" }}>
                                                    #{h.cert_number}
                                                </span>
                                            )}
                                            {h.acquisition_price && (
                                                <span style={{ fontSize: 11, color: colors.textMuted }}>
                                                    {formatCurrency(Number(h.acquisition_price))}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                {isApprovable && (
                                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                                        <button
                                            onClick={() => handleHolding(h.id, "approve")}
                                            disabled={actionLoading !== null}
                                            style={{
                                                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                                padding: "12px 16px", borderRadius: 10,
                                                background: colors.green, color: colors.textInverse,
                                                border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer",
                                                opacity: actionLoading !== null ? 0.6 : 1,
                                            }}
                                        >
                                            {actionLoading === h.id + "approve" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={14} strokeWidth={3} />}
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => handleHolding(h.id, "disapprove")}
                                            disabled={actionLoading !== null}
                                            style={{
                                                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                                padding: "12px 16px", borderRadius: 10,
                                                background: "rgba(255,80,0,0.10)", color: colors.red,
                                                border: `1px solid rgba(255,80,0,0.25)`, fontWeight: 700, fontSize: 14, cursor: "pointer",
                                                opacity: actionLoading !== null ? 0.6 : 1,
                                            }}
                                        >
                                            {actionLoading === h.id + "disapprove" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <X size={14} strokeWidth={3} />}
                                            Reject
                                        </button>
                                    </div>
                                )}
                                {h.status === "tradable" && (
                                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                        <Check size={14} style={{ color: colors.green }} strokeWidth={3} />
                                        <span style={{ color: colors.green, fontSize: 12, fontWeight: 700 }}>Approved — card is now tradable</span>
                                    </div>
                                )}
                                {h.status === "disapproved" && (
                                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                        <X size={14} style={{ color: colors.red }} strokeWidth={3} />
                                        <span style={{ color: colors.red, fontSize: 12, fontWeight: 700 }}>Rejected</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default function CheckInPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: "100dvh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={28} style={{ color: "#00C805", animation: "spin 1s linear infinite" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        }>
            <CheckInContent />
        </Suspense>
    );
}
