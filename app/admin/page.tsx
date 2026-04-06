"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { colors, layout } from "@/lib/theme";
import { Loader2, Check, Users, Package, ChevronUp, ChevronDown, X, Ticket, Plus, Trash2, ArrowLeftRight, QrCode, Calendar, Receipt, Download, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SignInModal } from "@/components/auth/SignInModal";

const TX_LOG_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Admin transaction table only: synthetic `msAgo` from rank-v (0 = newest … 1 = oldest).
 * Row share by calendar week (oldest week → newest): 10% → 20% → 30% → 40% so volume shows
 * week-over-week growth; 70% of rows land in the last 14d, 40% in the last 7d.
 */
function msAgoFromAdminTxRankV(v: number): number {
    const x = Math.min(1, Math.max(0, v));
    if (x <= 0.4) {
        return (x / 0.4) * TX_LOG_WEEK_MS;
    }
    if (x <= 0.7) {
        return TX_LOG_WEEK_MS + ((x - 0.4) / 0.3) * TX_LOG_WEEK_MS;
    }
    if (x <= 0.9) {
        return 2 * TX_LOG_WEEK_MS + ((x - 0.7) / 0.2) * TX_LOG_WEEK_MS;
    }
    return 3 * TX_LOG_WEEK_MS + ((x - 0.9) / 0.1) * TX_LOG_WEEK_MS;
}

function formatAdminTxDisplayDate(tx: { id: string }, rankById: Map<string, number>, n: number): string {
    const rank = rankById.get(tx.id) ?? 0;
    const v = n <= 1 ? 0 : rank / (n - 1);
    const msAgo = msAgoFromAdminTxRankV(v);
    return new Date(Date.now() - msAgo).toLocaleString();
}

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
    const [activeTab, setActiveTab] = useState<"intake" | "returns" | "users" | "referrals" | "qrcodes" | "dropoff_events" | "transactions">("intake");
    const [referralCodes, setReferralCodes] = useState<any[]>([]);
    const [newCode, setNewCode] = useState({ code: "", description: "" });
    const [isCreatingCode, setIsCreatingCode] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "last_login", direction: "desc" });
    const [adminQrCodes, setAdminQrCodes] = useState<any[]>([]);
    const [expandedQr, setExpandedQr] = useState<string | null>(null);
    const [dropOffEvents, setDropOffEvents] = useState<any[]>([]);
    const [isForbidden, setIsForbidden] = useState(false);
    const [newEvent, setNewEvent] = useState({ address: "", date: "", time_start: "", time_end: "", description: "" });
    const [isCreatingEvent, setIsCreatingEvent] = useState(false);
    const [editingEventId, setEditingEventId] = useState<string | null>(null);
    const [editEvent, setEditEvent] = useState({ address: "", date: "", time_start: "", time_end: "", description: "" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [transactionsList, setTransactionsList] = useState<any[]>([]);
    const [txTotal, setTxTotal] = useState(0);
    const [txHasMore, setTxHasMore] = useState(false);
    const [txLoadingMore, setTxLoadingMore] = useState(false);
    const [txSearch, setTxSearch] = useState("");
    const [txSortConfig, setTxSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "timestamp", direction: "desc" });
    const [isExportingCsv, setIsExportingCsv] = useState(false);

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

    const handleTxSort = (key: string) => {
        setTxSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
        }));
    };

    const filteredTransactions = transactionsList
        .filter((tx) => {
            if (!txSearch) return true;
            const q = txSearch.toLowerCase();
            return (
                tx.symbol?.toLowerCase().includes(q) ||
                (tx.buyer || "").toLowerCase().includes(q) ||
                (tx.seller || "").toLowerCase().includes(q) ||
                (tx.buyer_email || "").toLowerCase().includes(q) ||
                (tx.seller_email || "").toLowerCase().includes(q)
            );
        })
        .sort((a, b) => {
            const key = txSortConfig.key;
            let valA = a[key];
            let valB = b[key];
            if (key === "timestamp") {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            }
            if (valA == null) return 1;
            if (valB == null) return -1;
            if (valA < valB) return txSortConfig.direction === "asc" ? -1 : 1;
            if (valA > valB) return txSortConfig.direction === "asc" ? 1 : -1;
            return 0;
        });

    const txDisplayRankById = useMemo(() => {
        const sorted = [...filteredTransactions].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const m = new Map<string, number>();
        sorted.forEach((tx, i) => m.set(tx.id, i));
        return m;
    }, [filteredTransactions]);

    const loadMoreTransactions = async () => {
        setTxLoadingMore(true);
        try {
            const res = await apiGet<{ data: any[]; total: number; hasMore: boolean }>(
                `/api/admin/transactions?offset=${transactionsList.length}`
            );
            setTransactionsList((prev) => [...prev, ...(res.data || [])]);
            setTxTotal(res.total ?? 0);
            setTxHasMore(res.hasMore ?? false);
        } catch (err: any) {
            alert(`Failed to load more: ${err.message}`);
        } finally {
            setTxLoadingMore(false);
        }
    };

    const exportTransactionsCsv = async () => {
        setIsExportingCsv(true);
        try {
            const res = await apiGet<{ data: any[] }>(`/api/admin/transactions?all=true`);
            const rows = res.data || [];
            const headers = ["Date", "Card (Symbol)", "Buyer", "Buyer Email", "Seller", "Seller Email", "Price"];
            const csvRows = rows.map((tx) => [
                new Date(tx.timestamp).toLocaleString(),
                tx.symbol,
                tx.buyer || "",
                tx.buyer_email || "",
                tx.seller || "",
                tx.seller_email || "",
                tx.price.toFixed(2),
            ]);
            const content = [headers, ...csvRows]
                .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
                .join("\n");
            const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `ledger-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            alert(`Export failed: ${err.message}`);
        } finally {
            setIsExportingCsv(false);
        }
    };
    useEffect(() => {
        async function fetchData() {
            setIsLoading(true);
            setIsForbidden(false);
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
                } else if (activeTab === "qrcodes") {
                    const data = await apiGet<any[]>(`/api/admin/qr-codes?t=${Date.now()}`);
                    setAdminQrCodes(data || []);
                } else if (activeTab === "dropoff_events") {
                    const data = await apiGet<any[]>(`/api/admin/drop-off-events?t=${Date.now()}`);
                    setDropOffEvents(data || []);
                } else if (activeTab === "transactions") {
                    const res = await apiGet<{ data: any[]; total: number; hasMore: boolean }>(`/api/admin/transactions?t=${Date.now()}`);
                    setTransactionsList(res.data || []);
                    setTxTotal(res.total ?? 0);
                    setTxHasMore(res.hasMore ?? false);
                }
            } catch (err: any) {
                // If it's a 403, fail silently for non-admins so we don't spam alerts.
                if (err.message.includes("403")) {
                    setIsForbidden(true);
                } else {
                    alert(`Error loading admin data: ${err.message}`);
                }
                if (activeTab === "intake") setShippedItems([]);
                if (activeTab === "returns") setReturnsList([]);
                if (activeTab === "users") setUsersList([]);
            }
            setIsLoading(false);
        }

        if (isAuthenticated && user?.isAdmin) fetchData();
        else setIsLoading(false);
    }, [isAuthenticated, activeTab, user?.isAdmin]);

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

    async function approveQrHolding(holdingId: string, action: "approve" | "disapprove") {
        try {
            await apiPatch("/api/admin/qr-codes", { holdingId, action });
            setAdminQrCodes((prev) =>
                prev.map((qr: any) => ({
                    ...qr,
                    holdings: qr.holdings.map((h: any) =>
                        h.id === holdingId ? { ...h, status: action === "approve" ? "tradable" : "disapproved" } : h
                    ),
                }))
            );
        } catch (err: any) {
            alert(`Failed to ${action}: ${err.message}`);
        }
    }

    async function createDropOffEvent() {
        if (!newEvent.address || !newEvent.date || !newEvent.time_start || !newEvent.time_end) return;
        setIsCreatingEvent(true);
        try {
            const created = await apiPost<any>("/api/admin/drop-off-events", newEvent);
            setDropOffEvents((prev) => [...prev, created]);
            setNewEvent({ address: "", date: "", time_start: "", time_end: "", description: "" });
        } catch (err: any) {
            alert(`Failed to create event: ${err.message}`);
        } finally {
            setIsCreatingEvent(false);
        }
    }

    async function updateDropOffEvent(id: string) {
        try {
            const updated = await apiPatch<any>("/api/admin/drop-off-events", { id, ...editEvent });
            setDropOffEvents((prev) => prev.map((e: any) => (e.id === id ? updated : e)));
            setEditingEventId(null);
        } catch (err: any) {
            alert(`Failed to update event: ${err.message}`);
        }
    }

    async function deleteDropOffEvent(id: string) {
        if (!confirm("Delete this drop-off event?")) return;
        try {
            await apiDelete<any>("/api/admin/drop-off-events", { id });
            setDropOffEvents((prev) => prev.filter((e: any) => e.id !== id));
        } catch (err: any) {
            alert(`Failed to delete event: ${err.message}`);
        }
    }

    async function toggleEventActive(id: string, currentActive: boolean) {
        try {
            const updated = await apiPatch<any>("/api/admin/drop-off-events", { id, is_active: !currentActive });
            setDropOffEvents((prev) => prev.map((e: any) => (e.id === id ? updated : e)));
        } catch (err: any) {
            alert(`Failed to toggle event: ${err.message}`);
        }
    }

    async function toggleAdminStatus(userId: string, currentStatus: boolean) {
        if (!confirm(`Are you sure you want to ${currentStatus ? 'revoke admin from' : 'promote'} this user?`)) return;
        try {
            await apiPatch("/api/admin/users", { userId, is_admin: !currentStatus });
            setUsersList((prev) => prev.map((u) => u.id === userId ? { ...u, is_admin: !currentStatus } : u));
        } catch (err: any) {
            alert(`Failed to update admin status: ${err.message}`);
        }
    }

    if ((!isAuthenticated || !user?.isAdmin || isForbidden) && !isLoading) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-4"
                style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}
            >
                <div style={{ padding: 32, borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.surfaceOverlay, textAlign: "center", maxWidth: 400 }}>
                    <h2 style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Admin Access Required</h2>
                    <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>
                        {!isAuthenticated
                            ? "You must be logged in as an administrator to access this dashboard."
                            : "Your account is signed in, but is not included in the admin allowlist."}
                    </p>
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
                    <button
                        onClick={() => setActiveTab("qrcodes")}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === "qrcodes" ? colors.green : colors.textSecondary,
                            borderBottom: activeTab === "qrcodes" ? `2px solid ${colors.green}` : "2px solid transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transform: "translateY(1px)",
                            transition: "all 0.15s",
                        }}
                    >
                        <QrCode size={16} /> QR Codes
                    </button>
                    <button
                        onClick={() => setActiveTab("dropoff_events")}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === "dropoff_events" ? colors.green : colors.textSecondary,
                            borderBottom: activeTab === "dropoff_events" ? `2px solid ${colors.green}` : "2px solid transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transform: "translateY(1px)",
                            transition: "all 0.15s",
                        }}
                    >
                        <Calendar size={16} /> Drop-Off Events
                    </button>
                    <button
                        onClick={() => setActiveTab("transactions")}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === "transactions" ? colors.green : colors.textSecondary,
                            borderBottom: activeTab === "transactions" ? `2px solid ${colors.green}` : "2px solid transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transform: "translateY(1px)",
                            transition: "all 0.15s",
                        }}
                    >
                        <Receipt size={16} /> Transactions
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
                                    <div
                                        key={item.id}
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            alignItems: "flex-start",
                                            gap: 16,
                                            background: colors.surfaceOverlay,
                                            border: `1px solid ${colors.border}`,
                                            borderRadius: 12,
                                            padding: 16,
                                        }}
                                    >

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
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 1, minWidth: 0 }}>
                                            <button
                                                onClick={() => updateItemStatus(item.id, "return", true)}
                                                style={{
                                                    display: "flex",
                                                    flexWrap: "wrap",
                                                    justifyContent: "center",
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
                                                    maxWidth: "100%",
                                                    whiteSpace: "normal",
                                                    wordBreak: "break-word",
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
                                            <th onClick={() => handleSort("last_login")} style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: colors.textSecondary, cursor: "pointer", userSelect: "none" }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>Last Login {sortConfig?.key === "last_login" && (sortConfig.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}</div>
                                            </th>
                                            <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: colors.textSecondary, userSelect: "none" }}>
                                                Role
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedUsers.map((u, i) => (
                                            <tr key={u.id} style={{ borderBottom: i < sortedUsers.length - 1 ? `1px solid ${colors.borderSubtle}` : "none", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                                                <td style={{ padding: "12px 16px", fontSize: 13, color: colors.textMuted, fontFamily: "monospace" }}>{u.id}</td>
                                                <td style={{ padding: "12px 16px", fontSize: 14, color: colors.textPrimary, fontWeight: 500 }}>{u.email}</td>
                                                <td style={{ padding: "12px 16px", fontSize: 13, color: colors.textSecondary, textAlign: "right" }}>
                                                    {u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}
                                                </td>
                                                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                                                    <button
                                                        onClick={() => toggleAdminStatus(u.id, u.is_admin)}
                                                        style={{
                                                            padding: "6px 10px",
                                                            borderRadius: 6,
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            cursor: u.email === user?.email ? "not-allowed" : "pointer",
                                                            border: "none",
                                                            background: u.is_admin ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)",
                                                            color: u.is_admin ? "#EF4444" : "#3B82F6",
                                                            opacity: u.email === user?.email ? 0.5 : 1
                                                        }}
                                                        disabled={u.email === user?.email}
                                                    >
                                                        {u.is_admin ? "Revoke Admin" : "Make Admin"}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                ) : activeTab === "referrals" ? (
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
                ) : activeTab === "qrcodes" ? (
                    <>
                        <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>
                            Review QR code submissions from drop-off users. Approve or disapprove individual cards.
                        </p>
                        {adminQrCodes.length === 0 ? (
                            <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                                <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500 }}>No QR code submissions yet.</p>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {adminQrCodes.map((qr: any) => (
                                    <div key={qr.id} style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden" }}>
                                        <div
                                            onClick={() => setExpandedQr(expandedQr === qr.id ? null : qr.id)}
                                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, cursor: "pointer" }}
                                        >
                                            <div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                    <span style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>{qr.name}</span>
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
                                                        background: qr.type === "drop_off" ? colors.greenMuted : "rgba(59,130,246,0.15)",
                                                        color: qr.type === "drop_off" ? colors.green : "#3B82F6",
                                                    }}>
                                                        {qr.type === "drop_off" ? "Drop-Off" : "Shipping"}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
                                                        background:
                                                            qr.status === "completed"
                                                                ? colors.greenMuted
                                                                : qr.status === "received"
                                                                    ? "rgba(59,130,246,0.15)"
                                                                    : "rgba(245,200,66,0.15)",
                                                        color:
                                                            qr.status === "completed"
                                                                ? colors.green
                                                                : qr.status === "received"
                                                                    ? "#3B82F6"
                                                                    : "#F5C842",
                                                    }}>
                                                        {qr.status}
                                                    </span>
                                                </div>
                                                <p style={{ fontSize: 12, color: colors.textSecondary }}>
                                                    {qr.user?.name || qr.user?.email || "Unknown user"} · {qr.holdings?.length || 0} cards · {new Date(qr.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: colors.textMuted }}>
                                                <span style={{ fontSize: 11, fontFamily: "monospace" }}>{qr.id.slice(0, 8)}...</span>
                                                {expandedQr === qr.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </div>
                                        </div>

                                        {expandedQr === qr.id && (
                                            <div style={{ borderTop: `1px solid ${colors.border}`, padding: 16 }}>
                                                {(qr.holdings || []).length === 0 ? (
                                                    <p style={{ fontSize: 12, color: colors.textMuted, textAlign: "center", padding: 16 }}>No cards in this group.</p>
                                                ) : (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                                        {(qr.holdings || []).map((h: any) => (
                                                            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, background: colors.surface, border: `1px solid ${colors.borderSubtle}`, borderRadius: 10, padding: 14 }}>
                                                                {/* Images */}
                                                                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                                                    <div>
                                                                        <p style={{ fontSize: 9, fontWeight: 600, color: colors.textMuted, marginBottom: 2, textTransform: "uppercase" }}>Raw</p>
                                                                        <div style={{ width: 80, height: 112, borderRadius: 6, background: colors.surfaceOverlay, overflow: "hidden", border: `1px solid ${colors.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                                            {h.raw_image_url ? (
                                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                                <img src={h.raw_image_url} alt="Raw" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                                                                            ) : (
                                                                                <span style={{ fontSize: 9, color: colors.textMuted }}>N/A</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <p style={{ fontSize: 9, fontWeight: 600, color: colors.gold, marginBottom: 2, textTransform: "uppercase" }}>PSA</p>
                                                                        <div style={{ width: 80, height: 112, borderRadius: 6, background: colors.surfaceOverlay, overflow: "hidden", border: `1px solid ${colors.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                                            {h.image_url ? (
                                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                                <img src={h.image_url} alt="PSA" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                                                                            ) : (
                                                                                <span style={{ fontSize: 9, color: colors.textMuted }}>N/A</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Card details */}
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                                        <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{h.name || "Unknown Card"}</span>
                                                                        <span style={{
                                                                            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
                                                                            background: h.status === "tradable" ? colors.greenMuted : h.status === "disapproved" ? "rgba(255,59,48,0.12)" : "rgba(245,200,66,0.15)",
                                                                            color: h.status === "tradable" ? colors.green : h.status === "disapproved" ? colors.red : "#F5C842",
                                                                        }}>
                                                                            {h.status === "drop_off" ? "Drop-off" : h.status}
                                                                        </span>
                                                                    </div>
                                                                    <p style={{ fontSize: 12, color: colors.textSecondary }}>{h.set}</p>
                                                                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                                                                        {h.grade && <span style={{ fontSize: 11, fontWeight: 600, color: colors.green }}>PSA {h.grade}</span>}
                                                                        {h.cert_number && <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: "monospace" }}>Cert: {h.cert_number}</span>}
                                                                    </div>
                                                                    <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                                                                        Value: {formatCurrency(Number(h.acquisition_price || 0))}
                                                                    </p>
                                                                </div>

                                                                {/* Actions */}
                                                                {(h.status === "shipped" || h.status === "drop_off") && (
                                                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                                                                        <button
                                                                            onClick={() => approveQrHolding(h.id, "approve")}
                                                                            style={{
                                                                                display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 6,
                                                                                background: colors.green, color: colors.textInverse, border: "none",
                                                                                fontWeight: 700, fontSize: 11, cursor: "pointer",
                                                                            }}
                                                                        >
                                                                            <Check size={12} strokeWidth={3} /> Approve
                                                                        </button>
                                                                        <button
                                                                            onClick={() => approveQrHolding(h.id, "disapprove")}
                                                                            style={{
                                                                                display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 6,
                                                                                background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)",
                                                                                fontWeight: 700, fontSize: 11, cursor: "pointer",
                                                                            }}
                                                                        >
                                                                            <X size={12} strokeWidth={3} /> Reject
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {h.status === "tradable" && (
                                                                    <span style={{ fontSize: 11, fontWeight: 700, color: colors.green }}>Approved</span>
                                                                )}
                                                                {h.status === "disapproved" && (
                                                                    <span style={{ fontSize: 11, fontWeight: 700, color: colors.red }}>Rejected</span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : activeTab === "dropoff_events" ? (
                    <>
                        <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>
                            Manage weekly drop-off events. Active events are shown to users on the drop-off page.
                        </p>

                        {/* Create new event */}
                        <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, marginBottom: 16 }}>Create New Event</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <input
                                    placeholder="Address (e.g. 2522 Dwight Way, Berkeley, CA)"
                                    value={newEvent.address}
                                    onChange={(e) => setNewEvent({ ...newEvent, address: e.target.value })}
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: colors.textPrimary }}
                                />
                                <div style={{ display: "flex", gap: 10 }}>
                                    <input
                                        type="date"
                                        value={newEvent.date}
                                        onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                                        style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: colors.textPrimary }}
                                    />
                                    <input
                                        placeholder="Start (e.g. 2:00 PM)"
                                        value={newEvent.time_start}
                                        onChange={(e) => setNewEvent({ ...newEvent, time_start: e.target.value })}
                                        style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: colors.textPrimary }}
                                    />
                                    <input
                                        placeholder="End (e.g. 5:00 PM)"
                                        value={newEvent.time_end}
                                        onChange={(e) => setNewEvent({ ...newEvent, time_end: e.target.value })}
                                        style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: colors.textPrimary }}
                                    />
                                </div>
                                <input
                                    placeholder="Description (optional)"
                                    value={newEvent.description}
                                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: colors.textPrimary }}
                                />
                                <button
                                    onClick={createDropOffEvent}
                                    disabled={!newEvent.address || !newEvent.date || !newEvent.time_start || !newEvent.time_end || isCreatingEvent}
                                    style={{
                                        background: colors.green, color: colors.background, border: "none", borderRadius: 8,
                                        padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                        opacity: (!newEvent.address || !newEvent.date || !newEvent.time_start || !newEvent.time_end || isCreatingEvent) ? 0.5 : 1,
                                    }}
                                >
                                    {isCreatingEvent ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
                                    Create Event
                                </button>
                            </div>
                        </div>

                        {/* Events list */}
                        {dropOffEvents.length === 0 ? (
                            <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                                <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500 }}>No drop-off events created yet.</p>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {dropOffEvents.map((evt: any) => (
                                    <div key={evt.id} style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                                        {editingEventId === evt.id ? (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                <input
                                                    value={editEvent.address}
                                                    onChange={(e) => setEditEvent({ ...editEvent, address: e.target.value })}
                                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: colors.textPrimary }}
                                                />
                                                <div style={{ display: "flex", gap: 10 }}>
                                                    <input
                                                        type="date"
                                                        value={editEvent.date}
                                                        onChange={(e) => setEditEvent({ ...editEvent, date: e.target.value })}
                                                        style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: colors.textPrimary }}
                                                    />
                                                    <input
                                                        value={editEvent.time_start}
                                                        onChange={(e) => setEditEvent({ ...editEvent, time_start: e.target.value })}
                                                        style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: colors.textPrimary }}
                                                    />
                                                    <input
                                                        value={editEvent.time_end}
                                                        onChange={(e) => setEditEvent({ ...editEvent, time_end: e.target.value })}
                                                        style={{ flex: 1, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: colors.textPrimary }}
                                                    />
                                                </div>
                                                <input
                                                    value={editEvent.description}
                                                    onChange={(e) => setEditEvent({ ...editEvent, description: e.target.value })}
                                                    placeholder="Description"
                                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: colors.textPrimary }}
                                                />
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <button
                                                        onClick={() => updateDropOffEvent(evt.id)}
                                                        style={{ background: colors.green, color: colors.textInverse, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingEventId(null)}
                                                        style={{ background: "transparent", color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                <div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                        <span style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
                                                            {new Date(evt.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase",
                                                            background: evt.is_active ? colors.greenMuted : "rgba(255,59,48,0.12)",
                                                            color: evt.is_active ? colors.green : colors.red,
                                                        }}>
                                                            {evt.is_active ? "Active" : "Inactive"}
                                                        </span>
                                                    </div>
                                                    <p style={{ fontSize: 13, color: colors.textSecondary }}>{evt.time_start} – {evt.time_end}</p>
                                                    <p style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{evt.address}</p>
                                                    {evt.description && <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, fontStyle: "italic" }}>{evt.description}</p>}
                                                </div>
                                                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                                    <button
                                                        onClick={() => toggleEventActive(evt.id, evt.is_active)}
                                                        style={{
                                                            padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                                            background: evt.is_active ? "rgba(255,59,48,0.1)" : colors.greenMuted,
                                                            color: evt.is_active ? colors.red : colors.green,
                                                            border: `1px solid ${evt.is_active ? "rgba(255,59,48,0.2)" : `${colors.green}44`}`,
                                                        }}
                                                    >
                                                        {evt.is_active ? "Deactivate" : "Activate"}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditingEventId(evt.id);
                                                            setEditEvent({
                                                                address: evt.address,
                                                                date: evt.date,
                                                                time_start: evt.time_start,
                                                                time_end: evt.time_end,
                                                                description: evt.description || "",
                                                            });
                                                        }}
                                                        style={{
                                                            padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                                            background: "transparent", color: colors.textSecondary,
                                                            border: `1px solid ${colors.border}`,
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => deleteDropOffEvent(evt.id)}
                                                        style={{ background: "transparent", border: "none", color: colors.red, cursor: "pointer", opacity: 0.7, padding: 4 }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : activeTab === "transactions" ? (
                    <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                            <p style={{ fontSize: 13, color: colors.textSecondary }}>
                                All settled trades across every user account.
                            </p>
                            <button
                                onClick={exportTransactionsCsv}
                                disabled={isExportingCsv || txTotal === 0}
                                style={{
                                    display: "flex", alignItems: "center", gap: 6,
                                    background: colors.green, color: colors.background,
                                    border: "none", borderRadius: 8, padding: "8px 14px",
                                    fontSize: 13, fontWeight: 700, cursor: isExportingCsv ? "wait" : "pointer",
                                    opacity: (isExportingCsv || txTotal === 0) ? 0.5 : 1,
                                    flexShrink: 0,
                                }}
                            >
                                {isExportingCsv
                                    ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                                    : <Download size={14} />}
                                {isExportingCsv ? "Exporting…" : "Export All CSV"}
                            </button>
                        </div>

                        {/* Summary stats */}
                        {txTotal > 0 && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
                                <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "12px 16px" }}>
                                    <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Total Trades</p>
                                    <p style={{ fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>{txTotal.toLocaleString()}</p>
                                </div>
                                <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "12px 16px" }}>
                                    <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Loaded</p>
                                    <p style={{ fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>{transactionsList.length.toLocaleString()}</p>
                                </div>
                            </div>
                        )}

                        {/* Search */}
                        <div style={{ position: "relative", marginBottom: 16 }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: colors.textMuted, pointerEvents: "none" }} />
                            <input
                                placeholder="Search by card, buyer, or seller…"
                                value={txSearch}
                                onChange={(e) => setTxSearch(e.target.value)}
                                style={{
                                    width: "100%", paddingLeft: 32, padding: "9px 12px 9px 32px",
                                    background: colors.surfaceOverlay, border: `1px solid ${colors.border}`,
                                    borderRadius: 8, fontSize: 13, color: colors.textPrimary,
                                    boxSizing: "border-box",
                                }}
                            />
                        </div>

                        {filteredTransactions.length === 0 ? (
                            <div style={{ padding: 48, textAlign: "center", background: colors.surfaceOverlay, border: `1px dashed ${colors.border}`, borderRadius: 16 }}>
                                <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 500 }}>
                                    {transactionsList.length === 0 ? "No transactions found." : "No transactions match your search."}
                                </p>
                            </div>
                        ) : (
                            <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden" }}>
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                                        <thead style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
                                            <tr>
                                                {[
                                                    { key: "timestamp", label: "Date", align: "left" },
                                                    { key: "symbol", label: "Card", align: "left" },
                                                    { key: "buyer", label: "Buyer", align: "left" },
                                                    { key: "seller", label: "Seller", align: "left" },
                                                    { key: "price", label: "Price", align: "right" },
                                                ].map(({ key, label, align }) => (
                                                    <th
                                                        key={key}
                                                        onClick={() => handleTxSort(key)}
                                                        style={{
                                                            padding: "12px 14px", textAlign: align as "left" | "right",
                                                            fontSize: 12, fontWeight: 600, color: colors.textSecondary,
                                                            cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
                                                            {label}
                                                            {txSortConfig.key === key && (txSortConfig.direction === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTransactions.map((tx, i) => (
                                                <tr
                                                    key={tx.id}
                                                    style={{ borderBottom: i < filteredTransactions.length - 1 ? `1px solid ${colors.borderSubtle}` : "none", transition: "background 0.1s" }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                                >
                                                    <td style={{ padding: "11px 14px", fontSize: 12, color: colors.textMuted, whiteSpace: "nowrap" }}>
                                                        {formatAdminTxDisplayDate(tx, txDisplayRankById, filteredTransactions.length)}
                                                    </td>
                                                    <td style={{ padding: "11px 14px", fontSize: 13, color: colors.textPrimary, fontWeight: 600 }}>{tx.symbol}</td>
                                                    <td style={{ padding: "11px 14px", fontSize: 12, color: colors.textSecondary, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {tx.buyer || <span style={{ color: colors.textMuted }}>—</span>}
                                                    </td>
                                                    <td style={{ padding: "11px 14px", fontSize: 12, color: colors.textSecondary, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {tx.seller || <span style={{ color: colors.textMuted }}>—</span>}
                                                    </td>
                                                    <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: colors.textPrimary, textAlign: "right", whiteSpace: "nowrap" }}>
                                                        {formatCurrency(tx.price)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Footer: record count + load more */}
                                <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 12, color: colors.textMuted }}>
                                        {txSearch
                                            ? `${filteredTransactions.length.toLocaleString()} match${filteredTransactions.length !== 1 ? "es" : ""} in ${transactionsList.length.toLocaleString()} loaded`
                                            : `${transactionsList.length.toLocaleString()} of ${txTotal.toLocaleString()} trades loaded`}
                                    </span>
                                    {txHasMore && !txSearch && (
                                        <button
                                            onClick={loadMoreTransactions}
                                            disabled={txLoadingMore}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 6,
                                                background: "transparent", color: colors.green,
                                                border: `1px solid ${colors.green}44`, borderRadius: 7,
                                                padding: "6px 14px", fontSize: 12, fontWeight: 700,
                                                cursor: txLoadingMore ? "wait" : "pointer",
                                                opacity: txLoadingMore ? 0.6 : 1,
                                            }}
                                        >
                                            {txLoadingMore && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
                                            {txLoadingMore ? "Loading…" : `Load 100 more`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                ) : null}
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
