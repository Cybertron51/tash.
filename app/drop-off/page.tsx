"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { MapPin, Check, ExternalLink, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePortfolio } from "@/lib/portfolio-context";
import { SignInModal } from "@/components/auth/SignInModal";
import { apiGet, apiPost } from "@/lib/api";
import { colors, layout, psaGradeColor } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";

interface DropOffEvent {
    id: string;
    address: string;
    date: string;
    time_start: string;
    time_end: string;
    description: string | null;
    is_active: boolean;
}

export default function DropOffPage() {
    const { isAuthenticated, user } = useAuth();
    const { holdings } = usePortfolio();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [showSignIn, setShowSignIn] = useState(false);
    const [events, setEvents] = useState<DropOffEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        const preSelected = searchParams.get("selected");
        return preSelected ? new Set([preSelected]) : new Set();
    });
    const [submitting, setSubmitting] = useState(false);
    const [showNameModal, setShowNameModal] = useState(false);
    const [qrName, setQrName] = useState("");
    const [createdQrId, setCreatedQrId] = useState<string | null>(null);

    const pendingHoldings = holdings.filter((h) => h.status === "pending_authentication");

    useEffect(() => {
        async function loadEvents() {
            try {
                const data = await apiGet<DropOffEvent[]>("/api/admin/drop-off-events");
                setEvents(data || []);
            } catch {
                setEvents([]);
            }
            setEventsLoading(false);
        }
        loadEvents();
    }, []);

    const defaultName = () => {
        const date = new Date().toISOString().split("T")[0];
        const username = user?.name || user?.email?.split("@")[0] || "user";
        return `${date} - ${username}`;
    };

    function toggleCard(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function handleStartSubmit() {
        if (selectedIds.size === 0) return;
        setQrName(defaultName());
        setShowNameModal(true);
    }

    async function handleCreateQrCode() {
        if (!qrName.trim() || selectedIds.size === 0) return;
        setSubmitting(true);
        try {
            const res = await apiPost<{ id: string }>("/api/qr-codes", {
                name: qrName.trim(),
                type: "drop_off",
                holdingIds: Array.from(selectedIds),
            });
            setCreatedQrId(res.id);
            setShowNameModal(false);
        } catch (err: any) {
            alert(err.message || "Failed to create QR code");
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
                    <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>You must be logged in to drop off cards.</p>
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

    if (createdQrId) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-6"
                style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background, padding: 32 }}
            >
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 440 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: colors.greenMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <Check size={24} style={{ color: colors.green }} />
                    </div>
                    <h2 style={{ color: colors.textPrimary, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>QR Code Created</h2>
                    <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
                        Present this QR code when dropping off your cards. Your {selectedIds.size} card{selectedIds.size !== 1 ? "s" : ""} have been marked as submitted.
                    </p>
                    <div style={{ background: "#FFFFFF", padding: 20, borderRadius: 12, display: "inline-block", marginBottom: 20 }}>
                        <QRCodeSVG value={createdQrId} size={200} level="H" />
                    </div>
                    <p style={{ color: colors.textMuted, fontSize: 11, marginBottom: 24 }}>{qrName}</p>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            onClick={() => router.push("/account-qr-codes")}
                            style={{ flex: 1, background: colors.green, color: colors.textInverse, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}
                        >
                            View My QR Codes
                        </button>
                        <button
                            onClick={() => router.push("/portfolio")}
                            style={{ flex: 1, background: colors.surface, color: colors.textSecondary, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${colors.border}`, cursor: "pointer" }}
                        >
                            Back to Portfolio
                        </button>
                    </div>
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
                            <MapPin size={20} style={{ color: colors.green }} />
                        </div>
                        <h1 style={{ color: colors.textPrimary, fontSize: 24, fontWeight: 700 }}>Drop-Off</h1>
                    </div>
                    <p style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
                        Drop off your cards at one of our trusted handlers at a card show or weekly event for secure transfer and near-instant trading.
                    </p>
                </div>

                {/* Drop-off info */}
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
                    <p style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                        Drop-Off Times & Locations
                    </p>
                    <p style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                        Follow{" "}
                        <a
                            href="https://instagram.com/tash.cards"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: colors.green, fontWeight: 600, textDecoration: "none" }}
                        >
                            @tash.cards
                            <ExternalLink size={11} style={{ display: "inline", marginLeft: 3, verticalAlign: "middle" }} />
                        </a>{" "}
                        for card show drop-off times and locations.
                    </p>

                    {eventsLoading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                            <Loader2 size={20} style={{ color: colors.textMuted, animation: "spin 1s linear infinite" }} />
                        </div>
                    ) : events.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <p style={{ color: colors.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Upcoming Events
                            </p>
                            {events.map((evt) => (
                                <div
                                    key={evt.id}
                                    style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16 }}
                                >
                                    <p style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                                        {new Date(evt.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                                    </p>
                                    <p style={{ color: colors.textSecondary, fontSize: 13 }}>
                                        {evt.time_start} – {evt.time_end}
                                    </p>
                                    <p style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                                        {evt.address}
                                    </p>
                                    {evt.description && (
                                        <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, fontStyle: "italic" }}>
                                            {evt.description}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ background: colors.goldMuted, border: `1px solid ${colors.gold}44`, borderRadius: 8, padding: "10px 14px" }}>
                            <p style={{ color: colors.gold, fontSize: 12 }}>No upcoming events scheduled — check @tash.cards for updates.</p>
                        </div>
                    )}
                </div>

                {/* Card selection */}
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                            <p style={{ color: colors.textPrimary, fontSize: 16, fontWeight: 700 }}>Select Cards to Drop Off</p>
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
                            <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500, marginBottom: 8 }}>No pending cards to drop off.</p>
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
                                        {/* Checkbox */}
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

                                        {/* Card image */}
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

                                        {/* Card info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {h.name}
                                            </p>
                                            <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                                {h.set}
                                            </p>
                                        </div>

                                        {/* Grade + cert */}
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

                    {/* Submit button */}
                    {pendingHoldings.length > 0 && (
                        <button
                            onClick={handleStartSubmit}
                            disabled={selectedIds.size === 0}
                            style={{
                                width: "100%",
                                marginTop: 20,
                                padding: "14px 24px",
                                borderRadius: 12,
                                fontSize: 14,
                                fontWeight: 700,
                                background: selectedIds.size > 0 ? colors.green : colors.surface,
                                color: selectedIds.size > 0 ? colors.textInverse : colors.textMuted,
                                border: `1px solid ${selectedIds.size > 0 ? colors.green : colors.border}`,
                                cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
                                transition: "all 0.15s",
                            }}
                        >
                            Create QR Code ({selectedIds.size} card{selectedIds.size !== 1 ? "s" : ""})
                        </button>
                    )}
                </div>
            </div>

            {/* Name QR Code Modal */}
            {showNameModal && (
                <div
                    style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                    onClick={() => setShowNameModal(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: 400, padding: 24 }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>Name Your QR Code</span>
                            <button onClick={() => setShowNameModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 4, display: "flex" }}>
                                <X size={16} />
                            </button>
                        </div>
                        <p style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 20 }}>
                            This name helps you identify this drop-off batch later.
                        </p>
                        <label style={{ display: "block", color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                            QR Code Name
                        </label>
                        <input
                            type="text"
                            value={qrName}
                            onChange={(e) => setQrName(e.target.value)}
                            style={{
                                width: "100%",
                                background: colors.surfaceOverlay,
                                border: `1px solid ${colors.border}`,
                                borderRadius: 8,
                                color: colors.textPrimary,
                                fontSize: 14,
                                fontWeight: 600,
                                padding: "10px 12px",
                                outline: "none",
                                boxSizing: "border-box",
                            }}
                        />
                        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                            <button
                                onClick={() => setShowNameModal(false)}
                                style={{ flex: 1, background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.textSecondary, fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: "pointer" }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateQrCode}
                                disabled={!qrName.trim() || submitting}
                                style={{
                                    flex: 1,
                                    background: qrName.trim() ? colors.green : colors.surface,
                                    border: `1px solid ${qrName.trim() ? colors.green : colors.border}`,
                                    borderRadius: 10,
                                    color: qrName.trim() ? colors.textInverse : colors.textMuted,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    padding: "10px 16px",
                                    cursor: qrName.trim() && !submitting ? "pointer" : "not-allowed",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 8,
                                }}
                            >
                                {submitting && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
                                Generate QR Code
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
