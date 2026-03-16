"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { ChevronDown, ChevronUp, Edit3, Check, X, Plus, Trash2, Loader2, QrCode } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePortfolio } from "@/lib/portfolio-context";
import { SignInModal } from "@/components/auth/SignInModal";
import { apiGet, apiPatch, apiDelete } from "@/lib/api";
import { colors, layout, psaGradeColor } from "@/lib/theme";

interface QrHolding {
    junctionId: string;
    id: string;
    symbol: string;
    name: string;
    set: string;
    grade: number;
    cert_number: string;
    status: string;
    image_url: string | null;
    raw_image_url: string | null;
    acquisition_price: number;
}

interface QrCodeData {
    id: string;
    name: string;
    type: string;
    status: string;
    created_at: string;
    holdings: QrHolding[];
}

export default function AccountQrCodesPage() {
    const { isAuthenticated } = useAuth();
    const { holdings: portfolioHoldings } = usePortfolio();
    const [showSignIn, setShowSignIn] = useState(false);
    const [qrCodes, setQrCodes] = useState<QrCodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingNameId, setEditingNameId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [showAddPicker, setShowAddPicker] = useState<string | null>(null);

    const pendingHoldings = portfolioHoldings.filter((h) => h.status === "pending_authentication");

    async function loadQrCodes() {
        try {
            const data = await apiGet<QrCodeData[]>("/api/qr-codes");
            setQrCodes(data || []);
        } catch {
            setQrCodes([]);
        }
        setLoading(false);
    }

    useEffect(() => {
        if (isAuthenticated) loadQrCodes();
        else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]);

    async function handleRename(qrId: string) {
        if (!editName.trim()) return;
        try {
            await apiPatch("/api/qr-codes", { qrCodeId: qrId, name: editName.trim() });
            setQrCodes((prev) =>
                prev.map((qr) => (qr.id === qrId ? { ...qr, name: editName.trim() } : qr))
            );
        } catch (err: any) {
            alert(err.message || "Failed to rename");
        }
        setEditingNameId(null);
    }

    async function handleRemoveHolding(qrId: string, holdingId: string) {
        try {
            await apiPatch("/api/qr-codes", { qrCodeId: qrId, removeHoldingIds: [holdingId] });
            setQrCodes((prev) =>
                prev.map((qr) =>
                    qr.id === qrId
                        ? { ...qr, holdings: qr.holdings.filter((h) => h.id !== holdingId) }
                        : qr
                )
            );
        } catch (err: any) {
            alert(err.message || "Failed to remove card");
        }
    }

    async function handleAddHolding(qrId: string, holdingId: string) {
        try {
            await apiPatch("/api/qr-codes", { qrCodeId: qrId, addHoldingIds: [holdingId] });
            await loadQrCodes();
            setShowAddPicker(null);
        } catch (err: any) {
            alert(err.message || "Failed to add card");
        }
    }

    async function handleDeleteQrCode(qrId: string) {
        if (!confirm("Delete this QR code? Associated cards will revert to pending status.")) return;
        try {
            await apiDelete("/api/qr-codes", { qrCodeId: qrId });
            setQrCodes((prev) => prev.filter((qr) => qr.id !== qrId));
        } catch (err: any) {
            alert(err.message || "Failed to delete QR code");
        }
    }

    // Holdings already in any QR code
    const holdingsInQr = new Set(qrCodes.flatMap((qr) => qr.holdings.map((h) => h.id)));
    const availableForAdd = pendingHoldings.filter((h) => !holdingsInQr.has(h.id));

    if (!isAuthenticated) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-4"
                style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}
            >
                <div style={{ padding: 32, borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.surfaceOverlay, textAlign: "center", maxWidth: 400 }}>
                    <h2 style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign In Required</h2>
                    <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>You must be logged in to view your QR codes.</p>
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

    return (
        <div style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}>
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.greenMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <QrCode size={20} style={{ color: colors.green }} />
                    </div>
                    <h1 style={{ color: colors.textPrimary, fontSize: 24, fontWeight: 700 }}>My QR Codes</h1>
                </div>
                <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 32, lineHeight: 1.5 }}>
                    View and manage your drop-off QR codes. Present these at drop-off events.
                </p>

                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
                        <Loader2 size={24} style={{ color: colors.textMuted, animation: "spin 1s linear infinite" }} />
                    </div>
                ) : qrCodes.length === 0 ? (
                    <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                        <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500, marginBottom: 8 }}>No QR codes yet.</p>
                        <p style={{ fontSize: 12, color: colors.textMuted }}>Create one by submitting cards via the Drop-Off flow.</p>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {qrCodes.map((qr) => {
                            const isExpanded = expandedId === qr.id;
                            const isEditingName = editingNameId === qr.id;

                            return (
                                <div
                                    key={qr.id}
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: "hidden" }}
                                >
                                    {/* QR Code header */}
                                    <div
                                        style={{ display: "flex", alignItems: "center", gap: 16, padding: 20, cursor: "pointer" }}
                                        onClick={() => setExpandedId(isExpanded ? null : qr.id)}
                                    >
                                        {/* QR preview */}
                                        <div style={{ background: "#fff", padding: 6, borderRadius: 6, flexShrink: 0 }}>
                                            <QRCodeSVG value={qr.id} size={56} level="H" />
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {isEditingName ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(qr.id); if (e.key === "Escape") setEditingNameId(null); }}
                                                        autoFocus
                                                        style={{
                                                            background: colors.surfaceOverlay,
                                                            border: `1px solid ${colors.border}`,
                                                            borderRadius: 6,
                                                            color: colors.textPrimary,
                                                            fontSize: 14,
                                                            fontWeight: 600,
                                                            padding: "4px 8px",
                                                            outline: "none",
                                                            flex: 1,
                                                        }}
                                                    />
                                                    <button onClick={() => handleRename(qr.id)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.green, padding: 2 }}>
                                                        <Check size={16} />
                                                    </button>
                                                    <button onClick={() => setEditingNameId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 2 }}>
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <p style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>{qr.name}</p>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingNameId(qr.id);
                                                            setEditName(qr.name);
                                                        }}
                                                        style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 2 }}
                                                    >
                                                        <Edit3 size={13} />
                                                    </button>
                                                </div>
                                            )}
                                            <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                                                {qr.type === "drop_off" ? "Drop-Off" : "Shipping"} · {qr.holdings.length} card{qr.holdings.length !== 1 ? "s" : ""} · {new Date(qr.created_at).toLocaleDateString()}
                                            </p>
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    padding: "3px 8px",
                                                    borderRadius: 5,
                                                    textTransform: "uppercase",
                                                    background: qr.status === "completed" ? colors.greenMuted : "rgba(245,200,66,0.15)",
                                                    color: qr.status === "completed" ? colors.green : "#F5C842",
                                                }}
                                            >
                                                {qr.status}
                                            </span>
                                            {isExpanded ? <ChevronUp size={16} style={{ color: colors.textMuted }} /> : <ChevronDown size={16} style={{ color: colors.textMuted }} />}
                                        </div>
                                    </div>

                                    {/* Expanded content */}
                                    {isExpanded && (
                                        <div style={{ borderTop: `1px solid ${colors.border}`, padding: 20 }}>
                                            {/* Large QR code */}
                                            <div style={{ textAlign: "center", marginBottom: 20 }}>
                                                <div style={{ background: "#fff", padding: 16, borderRadius: 10, display: "inline-block" }}>
                                                    <QRCodeSVG value={qr.id} size={180} level="H" />
                                                </div>
                                                <p style={{ color: colors.textMuted, fontSize: 10, marginTop: 8, fontFamily: "monospace" }}>{qr.id}</p>
                                            </div>

                                            {/* Holdings list */}
                                            <p style={{ color: colors.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                                                Cards in this group
                                            </p>
                                            {qr.holdings.length === 0 ? (
                                                <p style={{ color: colors.textMuted, fontSize: 12, textAlign: "center", padding: 16 }}>No cards in this group.</p>
                                            ) : (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                    {qr.holdings.map((h) => {
                                                        const gradeColor = psaGradeColor[h.grade as 8 | 9 | 10] ?? colors.textSecondary;
                                                        return (
                                                            <div
                                                                key={h.id}
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: 12,
                                                                    padding: 10,
                                                                    borderRadius: 8,
                                                                    background: colors.surfaceOverlay,
                                                                    border: `1px solid ${colors.borderSubtle}`,
                                                                }}
                                                            >
                                                                <div style={{ width: 32, height: 44, borderRadius: 4, overflow: "hidden", border: `1px solid ${colors.border}`, flexShrink: 0 }}>
                                                                    <Image
                                                                        src={h.image_url || `/cards/${h.symbol}.svg`}
                                                                        alt={h.name || "Card"}
                                                                        width={32}
                                                                        height={44}
                                                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                                        unoptimized
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <p style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                        {h.name || "Unknown Card"}
                                                                    </p>
                                                                    <p style={{ color: colors.textMuted, fontSize: 10 }}>{h.set}</p>
                                                                </div>
                                                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: `${gradeColor}18`, border: `1px solid ${gradeColor}44`, color: gradeColor }}>
                                                                    PSA {h.grade}
                                                                </span>
                                                                <span
                                                                    style={{
                                                                        fontSize: 9,
                                                                        fontWeight: 700,
                                                                        padding: "2px 6px",
                                                                        borderRadius: 4,
                                                                        textTransform: "uppercase",
                                                                        background: h.status === "tradable" ? colors.greenMuted : h.status === "shipped" ? "rgba(245,200,66,0.15)" : h.status === "disapproved" ? "rgba(255,59,48,0.12)" : "rgba(245,200,66,0.15)",
                                                                        color: h.status === "tradable" ? colors.green : h.status === "shipped" ? "#F5C842" : h.status === "disapproved" ? colors.red : "#F5C842",
                                                                    }}
                                                                >
                                                                    {h.status === "shipped" ? "Submitted" : h.status}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleRemoveHolding(qr.id, h.id)}
                                                                    style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 4, flexShrink: 0 }}
                                                                    title="Remove from group"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Add cards button */}
                                            {availableForAdd.length > 0 && (
                                                <div style={{ marginTop: 12 }}>
                                                    {showAddPicker === qr.id ? (
                                                        <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                                                <p style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600 }}>Add a card</p>
                                                                <button onClick={() => setShowAddPicker(null)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 2 }}>
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                                                                {availableForAdd.map((h) => (
                                                                    <button
                                                                        key={h.id}
                                                                        onClick={() => handleAddHolding(qr.id, h.id)}
                                                                        style={{
                                                                            display: "flex",
                                                                            alignItems: "center",
                                                                            gap: 10,
                                                                            padding: 8,
                                                                            borderRadius: 6,
                                                                            border: `1px solid ${colors.borderSubtle}`,
                                                                            background: "transparent",
                                                                            cursor: "pointer",
                                                                            textAlign: "left",
                                                                            width: "100%",
                                                                            transition: "background 0.1s",
                                                                        }}
                                                                        onMouseEnter={(e) => { e.currentTarget.style.background = colors.surface; }}
                                                                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                                                    >
                                                                        <Plus size={14} style={{ color: colors.green, flexShrink: 0 }} />
                                                                        <p style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                                                            {h.name}
                                                                        </p>
                                                                        <span style={{ color: colors.textMuted, fontSize: 10 }}>PSA {h.grade}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setShowAddPicker(qr.id)}
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 6,
                                                                padding: "8px 14px",
                                                                borderRadius: 8,
                                                                border: `1px dashed ${colors.border}`,
                                                                background: "transparent",
                                                                color: colors.textMuted,
                                                                fontSize: 12,
                                                                fontWeight: 600,
                                                                cursor: "pointer",
                                                                width: "100%",
                                                                justifyContent: "center",
                                                            }}
                                                        >
                                                            <Plus size={14} /> Add Card
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* Delete QR code */}
                                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.borderSubtle}` }}>
                                                <button
                                                    onClick={() => handleDeleteQrCode(qr.id)}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        padding: "8px 14px",
                                                        borderRadius: 8,
                                                        border: `1px solid rgba(255,59,48,0.2)`,
                                                        background: "rgba(255,59,48,0.06)",
                                                        color: colors.red,
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    <Trash2 size={13} /> Delete QR Code
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
