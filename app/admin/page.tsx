"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { colors, layout } from "@/lib/theme";
import { Loader2, Check, Users, Package, ChevronUp, ChevronDown, X, Ticket, Plus, Trash2, ArrowLeftRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SignInModal } from "@/components/auth/SignInModal";

export default function AdminPage() {
    const { isAuthenticated, user } = useAuth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [shippedItems, setShippedItems] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [returnsList, setReturnsList] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [usersList, setUsersList] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSignIn, setShowSignIn] = useState(false);
    const [activeTab, setActiveTab] = useState<"intake" | "returns" | "users" | "referrals">("intake");
    const [referralCodes, setReferralCodes] = useState<any[]>([]);
    const [newCode, setNewCode] = useState({ code: "", description: "" });
    const [isCreatingCode, setIsCreatingCode] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "last_login", direction: "desc" });

    const sortedUsers = [...usersList].sort((a, b) => {
        if (!sortConfig) return 0;
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
    });

    const handleSort = (key: string) => {
        let direction: "asc" | "desc" = "asc";
        if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
            direction = "desc";
        }
        setSortConfig({ key, direction });
    };
    useEffect(() => {
        async function fetchData() {
            setIsLoading(true);
            try {
                if (activeTab === "intake") {
                    const data = await apiGet<any[]>(`/api/admin/approve?t=${Date.now()}`);
                    setShippedItems((data || []).filter((i: any) => i.status !== "returning"));
                } else if (activeTab === "returns") {
                    const data = await apiGet<any[]>(`/api/admin/approve?t=${Date.now()}`);
                    setReturnsList((data || []).filter((i: any) => i.status === "returning"));
                } else if (activeTab === "users") {
                    const data = await apiGet<any[]>(`/api/admin/users?t=${Date.now()}`);
                    setUsersList(data || []);
                } else if (activeTab === "referrals") {
                    const data = await apiGet<any[]>(`/api/admin/referrals?t=${Date.now()}`);
                    setReferralCodes(data || []);
                }
            } catch (err: any) {
                // If it's a 403, fail silently for non-admins so we don't spam alerts.
                if (!err.message.includes("403")) {
                    alert(`Error loading admin data: ${err.message}`);
                }
                if (activeTab === "intake") setShippedItems([]);
                if (activeTab === "returns") setReturnsList([]);
                if (activeTab === "users") setUsersList([]);
            }
            setIsLoading(false);
        }

        if (isAuthenticated && user?.email === "derekyp9@gmail.com") fetchData();
        else setIsLoading(false);
    }, [isAuthenticated, user?.email, activeTab]);

    async function updateItemStatus(id: string, action: "approve" | "disapprove" | "reset" | "return", isReturn = false) {
        // Optimistic UI
        if (isReturn) {
            setReturnsList((prev) => prev.filter((item) => item.id !== id));
        } else {
            setShippedItems((prev) => prev.filter((item) => item.id !== id));
        }

        try {
            await apiPatch("/api/admin/approve", { holdingId: id, action });
        } catch (err) {
            console.error(`Failed to ${action}:`, err);
        }
    }

    async function createReferralCode() {
        if (!newCode.code) return;
        setIsCreatingCode(true);
        try {
            const created = await apiPost<any>(`/api/admin/referrals`, newCode);
            setReferralCodes((prev) => [...prev, { ...created, usage_count: 0 }]);
            setNewCode({ code: "", description: "" });
        } catch (err: any) {
            alert(`Failed to create code: ${err.message}`);
        } finally {
            setIsCreatingCode(false);
        }
    }

    async function deleteReferralCode(id: string) {
        if (!confirm("Are you sure you want to delete this referral code?")) return;
        try {
            await apiDelete<any>(`/api/admin/referrals`, { id });
            setReferralCodes((prev) => prev.filter((c) => c.id !== id));
        } catch (err: any) {
            alert(`Failed to delete code: ${err.message}`);
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.textPrimary }}>
                        Administration
                    </h1>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 16, marginBottom: 32, borderBottom: `1px solid ${colors.borderSubtle}` }}>
                    <button
                        onClick={() => setActiveTab("intake")}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === "intake" ? colors.green : colors.textSecondary,
                            borderBottom: activeTab === "intake" ? `2px solid ${colors.green}` : "2px solid transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transform: "translateY(1px)",
                            transition: "all 0.15s",
                        }}
                    >
                        <Package size={16} /> Intake
                    </button>
                    <button
                        onClick={() => setActiveTab("returns")}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === "returns" ? colors.green : colors.textSecondary,
                            borderBottom: activeTab === "returns" ? `2px solid ${colors.green}` : "2px solid transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transform: "translateY(1px)",
                            transition: "all 0.15s",
                        }}
                    >
                        <ArrowLeftRight size={16} /> Returns
                    </button>
                    <button
                        onClick={() => setActiveTab("users")}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === "users" ? colors.green : colors.textSecondary,
                            borderBottom: activeTab === "users" ? `2px solid ${colors.green}` : "2px solid transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transform: "translateY(1px)",
                            transition: "all 0.15s",
                        }}
                    >
                        <Users size={16} /> Users
                    </button>
                    <button
                        onClick={() => setActiveTab("referrals")}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === "referrals" ? colors.green : colors.textSecondary,
                            borderBottom: activeTab === "referrals" ? `2px solid ${colors.green}` : "2px solid transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transform: "translateY(1px)",
                            transition: "all 0.15s",
                        }}
                    >
                        <Ticket size={16} /> Referrals
                    </button>
                </div>

                {isLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
                        <Loader2 size={24} style={{ color: colors.textMuted, animation: "spin 1s linear infinite" }} />
                    </div>
                ) : activeTab === "intake" ? (
                    <>
                        <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>
                            Approve physical assets that have been received via mail to immediately grant digital trading rights to the owner.
                        </p>
                        {shippedItems.length === 0 ? (
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
                                                            background: item.status === "shipped" ? "rgba(245,200,66,0.15)" : item.status === "returning" ? "rgba(59,130,246,0.15)" : item.status === "disapproved" ? "rgba(239, 68, 68, 0.15)" : "rgba(245,130,66,0.15)",
                                                            color: item.status === "shipped" ? "#F5C842" : item.status === "returning" ? "#3B82F6" : item.status === "disapproved" ? "#EF4444" : "#F58242",
                                                            textTransform: "uppercase"
                                                        }}>
                                                            {item.status === "shipped" ? "Shipped" : item.status === "returning" ? "Returning" : item.status === "disapproved" ? "Disapproved" : "Pending"}
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
                                        {item.status !== "disapproved" && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <button
                                                    onClick={() => updateItemStatus(item.id, "approve")}
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
                                                <button
                                                    onClick={() => updateItemStatus(item.id, "disapprove")}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        padding: "10px 16px",
                                                        borderRadius: 8,
                                                        background: `rgba(239, 68, 68, 0.1)`,
                                                        color: "#EF4444",
                                                        border: `1px solid rgba(239, 68, 68, 0.2)`,
                                                        fontWeight: 700,
                                                        fontSize: 13,
                                                        cursor: "pointer",
                                                        transition: "all 0.1s",
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)")}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)")}
                                                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                                                    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                                                >
                                                    <X size={14} strokeWidth={3} />
                                                    Disapprove
                                                </button>
                                            </div>
                                        )}

                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : activeTab === "returns" ? (
                    <>
                        <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>
                            Process items that owners have requested to be returned to them. Reset them to unshipped status here.
                        </p>
                        {returnsList.length === 0 ? (
                            <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                                <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500 }}>No items are currently being returned.</p>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {returnsList.map((item) => (
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
                                                            background: item.status === "shipped" ? "rgba(245,200,66,0.15)" : item.status === "returning" ? "rgba(59,130,246,0.15)" : item.status === "disapproved" ? "rgba(239, 68, 68, 0.15)" : "rgba(245,130,66,0.15)",
                                                            color: item.status === "shipped" ? "#F5C842" : item.status === "returning" ? "#3B82F6" : item.status === "disapproved" ? "#EF4444" : "#F58242",
                                                            textTransform: "uppercase"
                                                        }}>
                                                            {item.status === "shipped" ? "Shipped" : item.status === "returning" ? "Returning" : item.status === "disapproved" ? "Disapproved" : "Pending"}
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
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <button
                                                onClick={() => updateItemStatus(item.id, "return", true)}
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
                                                Mark as Returned (Unshipped)
                                            </button>
                                        </div>

                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : activeTab === "users" ? (
                    <>
                        <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>
                            View all registered users and their last login activity.
                        </p>
                        {usersList.length === 0 ? (
                            <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                                <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500 }}>No users found.</p>
                            </div>
                        ) : (
                            <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
                                        <tr>
                                            <th onClick={() => handleSort("id")} style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, color: colors.textSecondary, cursor: "pointer", userSelect: "none" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>User ID {sortConfig?.key === "id" && (sortConfig.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}</div>
                                            </th>
                                            <th onClick={() => handleSort("email")} style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, color: colors.textSecondary, cursor: "pointer", userSelect: "none" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>Email {sortConfig?.key === "email" && (sortConfig.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}</div>
                                            </th>
                                            <th onClick={() => handleSort("created_at")} style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: colors.textSecondary, cursor: "pointer", userSelect: "none" }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>Account Created {sortConfig?.key === "created_at" && (sortConfig.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}</div>
                                            </th>
                                            <th onClick={() => handleSort("last_login")} style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: colors.textSecondary, cursor: "pointer", userSelect: "none" }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>Last Login {sortConfig?.key === "last_login" && (sortConfig.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}</div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedUsers.map((u, i) => (
                                            <tr key={u.id} style={{ borderBottom: i < sortedUsers.length - 1 ? `1px solid ${colors.borderSubtle}` : "none", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                                                <td style={{ padding: "12px 16px", fontSize: 13, color: colors.textMuted, fontFamily: "monospace" }}>{u.id}</td>
                                                <td style={{ padding: "12px 16px", fontSize: 14, color: colors.textPrimary, fontWeight: 500 }}>{u.email}</td>
                                                <td style={{ padding: "12px 16px", fontSize: 13, color: colors.textSecondary, textAlign: "right" }}>
                                                    {u.created_at ? new Date(u.created_at).toLocaleString() : "Unknown"}
                                                </td>
                                                <td style={{ padding: "12px 16px", fontSize: 13, color: colors.textSecondary, textAlign: "right" }}>
                                                    {u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>
                            Manage referral codes and track their usage. Users cannot sign up without a valid code.
                        </p>

                        <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, marginBottom: 16 }}>Create New Referral Code</h3>
                            <div style={{ display: "flex", gap: 12 }}>
                                <input
                                    placeholder="CODE (e.g. BETA2025)"
                                    value={newCode.code}
                                    onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                                    style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: colors.textPrimary }}
                                />
                                <input
                                    placeholder="Description (optional)"
                                    value={newCode.description}
                                    onChange={(e) => setNewCode({ ...newCode, description: e.target.value })}
                                    style={{ flex: 2, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: colors.textPrimary }}
                                />
                                <button
                                    onClick={createReferralCode}
                                    disabled={!newCode.code || isCreatingCode}
                                    style={{
                                        background: colors.green,
                                        color: colors.background,
                                        border: "none",
                                        borderRadius: 8,
                                        padding: "8px 16px",
                                        fontWeight: 700,
                                        fontSize: 13,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        opacity: (!newCode.code || isCreatingCode) ? 0.5 : 1
                                    }}
                                >
                                    {isCreatingCode ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    Create
                                </button>
                            </div>
                        </div>

                        {referralCodes.length === 0 ? (
                            <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                                <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500 }}>No referral codes created yet.</p>
                            </div>
                        ) : (
                            <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
                                        <tr>
                                            <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Code</th>
                                            <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Description</th>
                                            <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Usage</th>
                                            <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {referralCodes.map((c, i) => (
                                            <tr key={c.id} style={{ borderBottom: i < referralCodes.length - 1 ? `1px solid ${colors.borderSubtle}` : "none" }}>
                                                <td style={{ padding: "12px 16px", fontSize: 14, color: colors.green, fontWeight: 800 }}>{c.code}</td>
                                                <td style={{ padding: "12px 16px", fontSize: 13, color: colors.textSecondary }}>{c.description || "—"}</td>
                                                <td style={{ padding: "12px 16px", fontSize: 14, color: colors.textPrimary, textAlign: "right", fontWeight: 700 }}>{c.usage_count} users</td>
                                                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                                                    <button
                                                        onClick={() => deleteReferralCode(c.id)}
                                                        style={{ background: "transparent", border: "none", color: colors.red, cursor: "pointer", opacity: 0.7 }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
