"use client";
export const dynamic = "force-dynamic";

/**
 * TASH — Portfolio Page
 *
 * Combined portfolio overview + vault holdings in one place.
 *
 * Two-column layout:
 *   Left  (280px) — card holdings list with live prices, search, sort, deposit
 *   Right (flex)  — portfolio overview (default) OR selected card detail
 */

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { X, Search, Plus, Camera, Upload, ArrowDownLeft, ArrowUpRight, Tag } from "lucide-react";
import Image from "next/image";

import { tickPrice, generateHistory, type TimeRange, type AssetData } from "@/lib/market-data";
import { PriceChart } from "@/components/market/PriceChart";
import { type VaultHolding } from "@/lib/vault-data";
import { updateVaultHoldingStatus, insertVaultHolding } from "@/lib/db/vault";
import { usePortfolio } from "@/lib/portfolio-context";
import { useAuth } from "@/lib/auth";
import { SignInModal } from "@/components/auth/SignInModal";
import { SubmitModal } from "@/components/layout/SubmitModal";
import { colors, layout, psaGradeColor, zIndex } from "@/lib/theme";
import { formatCurrency, cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { ArrowLeft } from "lucide-react";


// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type ModalState =
  | { type: "list"; holdingId: string; price: string }
  | { type: "withdraw"; holdingId: string }
  | { type: "deposit" }
  | { type: "submit"; holdingId: string }
  | null;

type SortBy = "value" | "gain" | "name" | "date";
type StatusFilter = "all" | "listed" | "in_transit" | "pending_authentication" | "shipped" | "received" | "authenticating" | "tradable" | "withdrawn" | "disapproved";

interface Activity {
  id: string;
  type: "deposit" | "listed" | "cancelled" | "withdrawn" | "shipped";
  cardName: string;
  grade: number;
  amount: number;
  timestamp: Date;
}

interface DepositForm {
  symbol: string;
  grade: 8 | 9 | 10;
  acquisitionPrice: number;
  certNumber: string;
  photoUrl: string | null;
}

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { holdings, openOrders, addHolding, updateHolding, removeHolding, removeOpenOrder } = usePortfolio();
  const { isAuthenticated, session, user, updateBalance } = useAuth();
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("value");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activities, setActivities] = useState<Activity[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const isMobile = useIsMobile();
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false);

  // Load market metadata
  useEffect(() => {
    async function fetchAssets() {
      setIsLoading(true);
      const { getMarketCards } = await import("@/lib/db/cards");
      const { mapDBCardToAssetData } = await import("@/lib/market-data");
      const dbCards = await getMarketCards();
      if (dbCards && dbCards.length > 0) {
        setAssets(dbCards.map(mapDBCardToAssetData));
      }
      setIsLoading(false);
    }
    fetchAssets();
  }, []);



  // ── Derived values ─────────────────────────────────────
  const priceMap = useMemo(
    () => Object.fromEntries(assets.map((a) => [a.symbol, a.price])),
    [assets]
  );
  const selected = holdings.find((h) => h.id === selectedId) ?? null;
  const totalValue = holdings.reduce((sum, h) => sum + (priceMap[h.symbol] ?? 0), 0);

  const visibleHoldings = holdings
    .filter((h) => h.name.toLowerCase().includes(search.toLowerCase()))
    .filter((h) => statusFilter === "all" || h.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === "value") return (priceMap[b.symbol] ?? 0) - (priceMap[a.symbol] ?? 0);
      if (sortBy === "gain") {
        const gA = ((priceMap[a.symbol] ?? 0) - a.acquisitionPrice) / a.acquisitionPrice;
        const gB = ((priceMap[b.symbol] ?? 0) - b.acquisitionPrice) / b.acquisitionPrice;
        return gB - gA;
      }
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "date") return new Date(b.dateDeposited).getTime() - new Date(a.dateDeposited).getTime();
      return 0;
    });

  // ── Action handlers ────────────────────────────────────
  function openListModal(id: string) {
    const holding = holdings.find((h) => h.id === id);
    if (!holding) return;
    const price = priceMap[holding.symbol] ?? 0;
    setModalState({ type: "list", holdingId: id, price: price.toFixed(2) });
  }

  async function confirmListing() {
    if (!modalState || modalState.type !== "list") return;
    const price = parseFloat(modalState.price);
    if (isNaN(price)) return;

    const holding = holdings.find((h) => h.id === modalState.holdingId);
    if (!holding || !user || !session) return;

    try {
      // Route through the CLOB — this calls place_order RPC with holding_id
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          symbol: holding.symbol,
          priceUsd: price,
          isBuy: false,
          quantity: 1,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to list");
      }

      // Update local state to reflect the listing
      updateHolding(modalState.holdingId, {
        status: "listed",
        listingPrice: price,
      });

      setActivities((prev) => [...prev, {
        id: `a${Date.now()}`,
        type: "listed",
        cardName: holding.name,
        grade: holding.grade,
        amount: price,
        timestamp: new Date(),
      }]);
    } catch (err) {
      console.error("Failed to list item:", err);
      alert("Failed to list item. Please try again.");
    }

    setModalState(null);
  }

  async function handleCancelListing(id: string) {
    const holding = holdings.find((h) => h.id === id);
    if (!holding || !user || !session) return;

    try {
      // Find the open sell order for this holding
      const matchingOrder = openOrders.find(
        (o) => o.holdingId === id && o.type === "sell"
      );

      if (matchingOrder) {
        // Cancel via the CLOB — this calls cancel_order RPC
        const res = await fetch("/api/orders", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orderId: matchingOrder.id }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to cancel");
        }

        removeOpenOrder(matchingOrder.id);
      } else {
        // Fallback: directly revert vault status if no matching order found
        // (covers edge cases where listing was created before CLOB migration)
        await updateVaultHoldingStatus(id, {
          status: "tradable",
          listingPrice: null
        });
      }

      // Revert status
      updateHolding(id, { status: "tradable", listingPrice: undefined });

      setActivities((prev) => [...prev, {
        id: `a${Date.now()}`,
        type: "cancelled",
        cardName: holding.name,
        grade: holding.grade,
        amount: priceMap[holding.symbol] ?? 0,
        timestamp: new Date(),
      }]);
    } catch (err) {
      console.error("Failed to cancel listing:", err);
      alert("Failed to cancel listing. Please try again.");
    }
  }

  function openWithdrawModal(id: string) {
    setModalState({ type: "withdraw", holdingId: id });
  }

  function openSubmitModal(id: string) {
    setModalState({ type: "submit", holdingId: id });
  }

  async function confirmWithdrawal(shippingAddress: string) {
    if (!modalState || modalState.type !== "withdraw") return;
    const holding = holdings.find((h) => h.id === modalState.holdingId);
    if (!holding) return;

    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          type: "holding",
          holdingId: holding.id,
          currentValueUsd: priceMap[holding.symbol] ?? 0,
          shippingAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Failed to withdraw:", data.error);
        alert(data.error || "Failed to process withdrawal");
        return;
      }

      updateHolding(modalState.holdingId, { status: "returning" });
      setActivities((prev) => [...prev, {
        id: `a${Date.now()}`,
        type: "withdrawn",
        cardName: holding.name,
        grade: holding.grade,
        amount: priceMap[holding.symbol] ?? 0,
        timestamp: new Date(),
      }]);
      updateBalance(-data.feeCharged); // Optimisticaly deduct fee
    } catch (err) {
      console.error("Error withdrawing:", err);
      alert("Network error processing withdrawal.");
    }

    setModalState(null);
  }

  async function handleRemoveCard(id: string) {
    const holding = holdings.find((h) => h.id === id);
    if (!holding || !session) return;

    if (!confirm(`Are you sure you want to remove ${holding.name} from your portfolio?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/vault/holdings?id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove card");
      }

      // Update local state
      removeHolding(id);
      setSelectedId(null);
      setActivities((prev) => [...prev, {
        id: `a${Date.now()}`,
        type: "cancelled", // Using cancelled as a close enough type
        cardName: holding.name,
        grade: holding.grade,
        amount: priceMap[holding.symbol] ?? 0,
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      console.error("Failed to remove card:", err);
      alert(err.message || "Failed to remove card. Please try again.");
    }
  }

  // ── Modal holding lookup ───────────────────────────────
  const modalHolding =
    modalState && modalState.type !== "deposit"
      ? holdings.find((h) => h.id === modalState.holdingId) ?? null
      : null;
  const modalValue = modalHolding ? (priceMap[modalHolding.symbol] ?? 0) : 0;

  // ── Deposit handler ────────────────────────────────────
  async function confirmDeposit(form: DepositForm) {
    const asset = assets.find((a) => a.symbol === form.symbol);
    if (!asset) return;

    try {
      const dbRes: any = await insertVaultHolding({
        symbol: asset.symbol,
        acquisitionPrice: form.acquisitionPrice,
        status: "tradable",
        certNumber: form.certNumber || `PSA ${Math.floor(Math.random() * 90000000 + 10000000)}`,
        imageUrl: form.photoUrl ?? asset.imageUrl ?? `/cards/${asset.symbol}.svg`,
      });

      const newHolding: VaultHolding = {
        id: dbRes?.id || `v${Date.now()}`,
        name: asset.name,
        symbol: asset.symbol,
        grade: form.grade,
        set: asset.set,
        year: new Date().getFullYear(),
        acquisitionPrice: form.acquisitionPrice,
        status: "tradable",
        dateDeposited: new Date().toISOString().split("T")[0],
        certNumber: form.certNumber || `PSA ${Math.floor(Math.random() * 90000000 + 10000000)}`,
        imageUrl: form.photoUrl ?? asset.imageUrl ?? `/cards/${asset.symbol}.svg`,
      };

      addHolding(newHolding);
      setSelectedId(newHolding.id);
      setActivities((prev) => [...prev, {
        id: `a${Date.now()}`,
        type: "deposit",
        cardName: asset.name,
        grade: form.grade,
        amount: form.acquisitionPrice,
        timestamp: new Date(),
      }]);
      setModalState(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save deposit");
    }
  }

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}
      >
        <p style={{ color: colors.textMuted, fontSize: 13, fontWeight: 600 }}>
          Loading portfolio data...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4"
        style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}
      >
        <div style={{ padding: 32, borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.surfaceOverlay, textAlign: "center", maxWidth: 400 }}>
          <h2 style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign In Required</h2>
          <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>You must be logged in to view your portfolio and manage your assets.</p>
          <button
            onClick={() => setShowSignIn(true)}
            style={{ width: "100%", background: colors.green, color: colors.background, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, transition: "transform 0.15s" }}
            onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
            onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          >
            Sign In / Sign Up
          </button>
        </div>
        {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col md:flex-row"
      style={{
        height: `calc(100dvh - ${layout.chromeHeight})`,
        overflow: "hidden"
      }}
    >
      {/* ══════════════════════════════════════════════════
          LEFT — Holdings list
      ══════════════════════════════════════════════════ */}
      <aside
        className={cn(
          "flex flex-col border-r",
          isMobile && showDetailOnMobile ? "hidden" : "flex w-full md:w-[280px]"
        )}
        style={{ minWidth: isMobile ? "100%" : 280, borderColor: colors.border, background: colors.background }}
      >
        {/* Header */}
        <div
          className="shrink-0 border-b px-4 py-3"
          style={{ background: colors.background, borderColor: colors.border }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[16px] font-bold leading-tight" style={{ color: colors.textPrimary }}>
              Portfolio
            </p>
          </div>
          <p
            className="mt-[2px] tabular-nums text-[20px] font-bold leading-tight tracking-tight"
            style={{ color: colors.textPrimary }}
          >
            {formatCurrency(totalValue)}
          </p>
          <p className="mt-[1px] text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
            Total Value
          </p>

          {/* Search */}
          <div
            className="mt-3 flex items-center gap-2 rounded-[8px] px-2 py-[6px]"
            style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
          >
            <Search size={12} style={{ color: colors.textMuted, flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              placeholder="Search cards..."
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: "none", border: "none", outline: "none",
                color: colors.textPrimary, fontSize: 12, width: "100%", fontFamily: "inherit",
              }}
            />
            {search && (
              <button
                onClick={() => { setSearch(""); if (searchRef.current) { searchRef.current.value = ""; searchRef.current.focus(); } }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
              >
                <X size={11} style={{ color: colors.textMuted }} />
              </button>
            )}
          </div>

          {/* Sort pills */}
          <div className="mt-2 flex gap-1">
            {(["value", "gain", "name", "date"] as SortBy[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setSortBy(opt)}
                style={{
                  fontSize: 10, fontWeight: 600, textTransform: "capitalize",
                  padding: "3px 7px", borderRadius: 6,
                  border: `1px solid ${sortBy === opt ? colors.green : colors.border}`,
                  background: sortBy === opt ? colors.greenMuted : "transparent",
                  color: sortBy === opt ? colors.green : colors.textMuted,
                  cursor: "pointer",
                }}
              >
                {opt === "gain" ? "Gain %" : opt === "date" ? "Newest" : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Holdings rows */}
        <div className="flex-1 overflow-y-auto">
          {/* Status filter chips */}
          <div className="flex gap-1 flex-wrap border-b px-3 py-2" style={{ borderColor: colors.borderSubtle }}>
            {([
              { key: "all" as const, label: "All" },
              { key: "pending_authentication" as const, label: "Pending" },
              { key: "in_transit" as const, label: "Transit" }, // Keep for legacy but map to shipped/received mentally or remove
              { key: "shipped" as const, label: "Shipped" },
              { key: "authenticating" as const, label: "Authenticating" },
              { key: "tradable" as const, label: "Vaulted" },
              { key: "listed" as const, label: "Listed" },
              { key: "disapproved" as const, label: "Disapproved" },
            ]).map(({ key, label }) => {
              const count = key === "all" ? holdings.length : holdings.filter((h) => h.status === key).length;
              const isActive = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  style={{
                    fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 6,
                    border: `1px solid ${isActive ? colors.green : colors.border}`,
                    background: isActive ? colors.greenMuted : "transparent",
                    color: isActive ? colors.green : colors.textMuted,
                    cursor: "pointer",
                  }}
                >
                  {label} <span style={{ opacity: 0.7 }}>({count})</span>
                </button>
              );
            })}
          </div>

          {/* "All" / overview row */}
          <button
            onClick={() => {
              setSelectedId(null);
              if (isMobile) setShowDetailOnMobile(true);
            }}
            className="w-full border-b text-left transition-colors duration-100 hover:bg-[#0f0f0f]"
            style={{
              borderColor: colors.borderSubtle,
              background: selectedId === null ? colors.greenMuted : "transparent",
              borderLeft: `2px solid ${selectedId === null ? colors.green : "transparent"}`,
              paddingLeft: selectedId === null ? 10 : 12,
              paddingRight: 12, paddingTop: 10, paddingBottom: 10,
            }}
          >
            <p className="text-[12px] font-semibold" style={{ color: colors.textPrimary }}>
              Overview
            </p>
            <p className="text-[10px] uppercase tracking-wider mt-[1px]" style={{ color: colors.textMuted }}>
              All {holdings.length} cards
            </p>
          </button>

          {visibleHoldings.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px]" style={{ color: colors.textMuted }}>
              No cards match &ldquo;{search}&rdquo;
            </p>
          )}
          {visibleHoldings.map((holding) => {
            const currentValue = priceMap[holding.symbol] ?? 0;
            const gain = currentValue - holding.acquisitionPrice;
            const isGain = gain >= 0;
            const isSel = holding.id === selectedId;
            const gradeColor = psaGradeColor[holding.grade as 8 | 9 | 10] ?? colors.textSecondary;

            return (
              <button
                key={holding.id}
                onClick={() => {
                  setSelectedId(holding.id);
                  if (isMobile) setShowDetailOnMobile(true);
                }}
                className="w-full border-b text-left transition-colors duration-100 hover:bg-[#0f0f0f]"
                style={{
                  borderColor: colors.borderSubtle,
                  background: isSel ? colors.greenMuted : "transparent",
                  borderLeft: `2px solid ${isSel ? colors.green : "transparent"}`,
                  paddingLeft: isSel ? 10 : 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10,
                }}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="shrink-0 overflow-hidden rounded-[4px]"
                    style={{ width: 32, height: 44, border: `1px solid ${colors.border}`, background: colors.surface }}
                  >
                    <Image
                      src={holding.imageUrl || `/cards/${holding.symbol}.svg`} alt={holding.name} width={32} height={44}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="truncate text-[12px] font-semibold leading-snug" style={{ color: colors.textPrimary }}>
                        {holding.name}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <div
                          className="rounded-full"
                          style={{
                            width: 6, height: 6, flexShrink: 0,
                            background:
                              holding.status === "tradable" ? colors.green
                                : holding.status === "listed" ? colors.gold
                                  : holding.status === "withdrawn" ? colors.textMuted
                                    : holding.status === "disapproved" ? colors.red
                                      : "#F5C842", // pending, shipped, received, authenticating
                          }}
                        />
                        <div
                          className="rounded-[5px] px-[6px] py-[2px]"
                          style={{ background: `${gradeColor}18`, border: `1px solid ${gradeColor}44` }}
                        >
                          <span className="text-[10px] font-bold tracking-wide" style={{ color: gradeColor }}>
                            PSA {holding.grade}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-[1px] truncate text-[10px] uppercase tracking-wider" style={{ color: colors.textMuted }}>
                      {holding.set}
                    </p>
                    <div className="mt-[4px] flex items-center justify-between">
                      <span className="tabular-nums text-[13px] font-bold" style={{ color: colors.textPrimary }}>
                        {formatCurrency(currentValue)}
                      </span>
                      <span className="tabular-nums text-[11px] font-semibold" style={{ color: isGain ? colors.green : colors.red }}>
                        {isGain ? "+" : ""}{formatCurrency(gain)}
                      </span>
                    </div>
                    {holding.status === "listed" && holding.listingPrice && (
                      <p className="mt-[2px] tabular-nums text-[10px] font-semibold" style={{ color: colors.gold }}>
                        Listed: {formatCurrency(holding.listingPrice)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════
          RIGHT — Portfolio overview OR card detail
      ══════════════════════════════════════════════════ */}
      <main
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-y-auto",
          isMobile && !showDetailOnMobile ? "hidden" : "flex"
        )}
        style={{ background: colors.background }}
      >
        {isMobile && showDetailOnMobile && (
          <div className="flex items-center gap-2 p-4 border-b shrink-0" style={{ borderColor: colors.borderSubtle }}>
            <button
              onClick={() => setShowDetailOnMobile(false)}
              className="flex items-center gap-2 text-[13px] font-bold"
              style={{ color: colors.green }}
            >
              <ArrowLeft size={16} />
              <span>Back to Portfolio</span>
            </button>
          </div>
        )}
        {selected === null ? (
          <PortfolioOverview
            holdings={holdings}
            openOrders={openOrders}
            priceMap={priceMap}
            assets={assets}
            activities={activities}
            onSelectCard={setSelectedId}
            onCancelOrder={async (id) => {
              try {
                const res = await fetch("/api/orders", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
                  body: JSON.stringify({ orderId: id })
                });
                if (!res.ok) throw new Error("Failed to cancel");
                removeOpenOrder(id);
                // We could also optimistically restore balance/holding status here,
                // but for simplicity the page refresh or context refetch will fix it eventually.
                // Best would be to call a context method that does a full refetch, but let's 
                // just rely on removeOpenOrder for the UI update of the order list.
              } catch (e) {
                console.error(e);
                alert("Failed to cancel order");
              }
            }}
          />
        ) : (
          <DetailPanel
            key={selected.id}
            holding={selected}
            currentValue={priceMap[selected.symbol] ?? 0}
            changePct={assets.find((a) => a.symbol === selected.symbol)?.changePct ?? 0}
            onOpenListModal={openListModal}
            onCancelListing={handleCancelListing}
            onOpenWithdrawModal={openWithdrawModal}
            onOpenSubmitModal={openSubmitModal}
            onRemoveCard={handleRemoveCard}
          />
        )}
      </main>

      {/* ══════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════ */}

      {modalState?.type === "deposit" && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: zIndex.modal, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalState(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: 440, maxHeight: "90vh", overflowY: "auto", padding: 24 }}
          >
            <DepositModal assets={assets} onCancel={() => setModalState(null)} onConfirm={confirmDeposit} />
          </div>
        </div>
      )}

      {modalState?.type === "submit" && (
        <SubmitModal
          onClose={() => setModalState(null)}
          preSelectedHoldingId={modalState.holdingId}
        />
      )}

      {modalState && modalState.type !== "deposit" && modalState.type !== "submit" && modalHolding && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: zIndex.modal, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalState(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: 400, padding: 24 }}
          >
            {modalState.type === "list" ? (
              <ListModal
                holding={modalHolding}
                price={modalState.price}
                marketPrice={modalValue}
                onPriceChange={(p) => setModalState({ type: "list", holdingId: modalState.holdingId, price: p })}
                onCancel={() => setModalState(null)}
                onConfirm={confirmListing}
              />
            ) : (
              <WithdrawModal
                holding={modalHolding}
                currentValue={modalValue}
                onCancel={() => setModalState(null)}
                onConfirm={(address: string) => confirmWithdrawal(address)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Portfolio Overview (right panel default state)
// ─────────────────────────────────────────────────────────

interface PortfolioOverviewProps {
  holdings: VaultHolding[];
  openOrders: import("@/lib/portfolio-context").OpenOrder[];
  priceMap: Record<string, number>;
  assets: AssetData[];
  activities: Activity[];
  onSelectCard: (id: string) => void;
  onCancelOrder: (id: string) => void;
}

function PortfolioOverview({ holdings, openOrders, priceMap, assets, activities, onSelectCard, onCancelOrder }: PortfolioOverviewProps) {
  const [range, setRange] = useState<TimeRange>("1M");
  const [portfolioTab, setPortfolioTab] = useState<"holdings" | "orders">("holdings");

  // ── Portfolio-level stats ──────────────────────────────
  const totalValue = holdings.reduce((sum, h) => sum + (priceMap[h.symbol] ?? 0), 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.acquisitionPrice, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const isGain = totalGain >= 0;

  // Today's P&L (sum of each card's $ change from live tick)
  const todayChange = holdings.reduce((sum, h) => {
    const asset = assets.find((a) => a.symbol === h.symbol);
    return sum + (asset?.change ?? 0);
  }, 0);
  const todayIsUp = todayChange >= 0;

  // Weighted changePct for the portfolio chart
  const weightedChangePct =
    totalValue > 0
      ? holdings.reduce((sum, h) => {
        const val = priceMap[h.symbol] ?? 0;
        const asset = assets.find((a) => a.symbol === h.symbol);
        return sum + (val / totalValue) * (asset?.changePct ?? 0);
      }, 0)
      : 0;

  const chartData = generateHistory(totalValue, weightedChangePct, range, "PORTFOLIO");

  // ── Category breakdown ─────────────────────────────────
  const categoryValues: Record<string, number> = {};
  holdings.forEach((h) => {
    const asset = assets.find((a) => a.symbol === h.symbol);
    const cat = asset?.category === "pokemon" ? "Pokémon" : asset?.category === "sports" ? "Sports" : asset?.category === "mtg" ? "Magic" : "Other";
    categoryValues[cat] = (categoryValues[cat] ?? 0) + (priceMap[h.symbol] ?? 0);
  });
  const categories = Object.entries(categoryValues).sort((a, b) => b[1] - a[1]);
  const maxCatValue = Math.max(...categories.map(([, v]) => v), 1);

  // ── Status breakdown ───────────────────────────────────
  const inVault = holdings.filter((h) => h.status === "tradable").length;
  const listed = holdings.filter((h) => h.status === "listed").length;
  const inTransit = holdings.filter((h) => h.status === "in_transit").length;

  // ── Top performers ─────────────────────────────────────
  const withPerf = holdings
    .map((h) => ({
      ...h,
      currentValue: priceMap[h.symbol] ?? 0,
      gain: (priceMap[h.symbol] ?? 0) - h.acquisitionPrice,
      gainPct: (((priceMap[h.symbol] ?? 0) - h.acquisitionPrice) / h.acquisitionPrice) * 100,
    }))
    .sort((a, b) => b.gainPct - a.gainPct);

  const topGainers = withPerf.slice(0, 3);
  const topLosers = [...withPerf].reverse().slice(0, 3).filter((h) => h.gainPct < 0);

  const statCell = (label: string, value: string, valueColor: string = colors.textPrimary) => (
    <div className="flex flex-col gap-[4px] px-4 py-3" style={{ borderColor: colors.borderSubtle }}>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
        {label}
      </span>
      <span className="tabular-nums text-[13px] font-semibold" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="p-6">
      {/* ── Hero ── */}
      <div className="mb-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
          Total Portfolio Value
        </p>
        <p
          className="tabular-nums text-[40px] font-bold leading-none tracking-tight"
          style={{ color: colors.textPrimary }}
        >
          {formatCurrency(totalValue)}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className="tabular-nums text-[16px] font-semibold"
            style={{ color: isGain ? colors.green : colors.red }}
          >
            {isGain ? "+" : ""}{formatCurrency(totalGain)} ({isGain ? "+" : ""}{totalGainPct.toFixed(2)}%)
          </span>
          <span className="text-[11px]" style={{ color: colors.textMuted }}>all time</span>
          <span
            className="tabular-nums text-[12px] font-medium"
            style={{ color: todayIsUp ? colors.green : colors.red }}
          >
            {todayIsUp ? "▲" : "▼"} {todayIsUp ? "+" : ""}{formatCurrency(Math.abs(todayChange))} today
          </span>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div
        className="mb-5 flex rounded-[10px] p-[3px]"
        style={{ background: colors.surfaceOverlay }}
      >
        {(["holdings", "orders"] as const).map((tab) => {
          const isActive = portfolioTab === tab;
          const label = tab === "holdings" ? "Holdings" : `Open Orders${openOrders.length > 0 ? ` (${openOrders.length})` : ""}`;
          return (
            <button
              key={tab}
              onClick={() => setPortfolioTab(tab)}
              className="flex-1 rounded-[8px] py-[8px] text-[12px] font-semibold transition-all duration-150"
              style={{
                background: isActive ? colors.surface : "transparent",
                color: isActive ? colors.textPrimary : colors.textMuted,
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {portfolioTab === "orders" ? (
        /* ── Open Orders Tab ── */
        <OpenOrdersView openOrders={openOrders} onCancelOrder={onCancelOrder} />
      ) : (
        <>

          {/* ── Stats grid ── */}
          <div
            className="mb-5 grid grid-cols-4 overflow-hidden rounded-[10px] border"
            style={{ borderColor: colors.border, background: colors.surface }}
          >
            <div className="border-r" style={{ borderColor: colors.borderSubtle }}>
              {statCell("Cost Basis", formatCurrency(totalCost))}
            </div>
            <div className="border-r" style={{ borderColor: colors.borderSubtle }}>
              {statCell("Holdings", `${holdings.length} cards`)}
            </div>
            <div className="border-r" style={{ borderColor: colors.borderSubtle }}>
              {statCell("In Vault", `${inVault} · ${listed} listed`)}
            </div>
            {statCell(
              "All-Time P&L",
              `${isGain ? "+" : ""}${totalGainPct.toFixed(1)}%`,
              isGain ? colors.green : colors.red
            )}
          </div>

          {/* ── Portfolio performance chart ── */}
          <div className="mb-6">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
              Portfolio Performance
            </p>
            <PriceChart data={chartData} isUp={isGain} range={range} onRangeChange={setRange} />
          </div>

          {/* ── Live Bids ── */}
          {openOrders.filter(o => o.type === "buy").length > 0 && (
            <div className="mb-6 rounded-[10px] border overflow-hidden" style={{ borderColor: colors.border }}>
              <div
                className="flex items-center justify-between border-b px-4 py-3"
                style={{ borderColor: colors.border, background: colors.surfaceOverlay }}
              >
                <span className="text-[12px] font-bold tracking-wide flex items-center gap-2" style={{ color: colors.textPrimary }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: colors.green }} />
                  Live Bids (Unfilled)
                </span>
              </div>
              <div className="grid grid-cols-4 border-b px-4 py-2" style={{ borderColor: colors.border, background: colors.surface }}>
                {["Card", "Limit Price", "Qty", ""].map((h) => (
                  <span key={h} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                    {h}
                  </span>
                ))}
              </div>
              {openOrders.filter(o => o.type === "buy").map((o) => {
                const gradeColor = psaGradeColor[o.grade as 8 | 9 | 10] ?? colors.textSecondary;
                return (
                  <div
                    key={o.id}
                    className="grid grid-cols-4 w-full border-b px-4 py-3 text-left transition-colors hover:bg-[#0f0f0f]"
                    style={{ borderColor: colors.borderSubtle }}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate text-[12px] font-semibold" style={{ color: colors.textPrimary }}>{o.cardName}</p>
                      <div>
                        <span
                          className="inline-block rounded-[5px] mt-1 px-[6px] py-[2px] text-[10px] font-bold tracking-wide"
                          style={{ background: `${gradeColor}18`, border: `1px solid ${gradeColor}44`, color: gradeColor }}
                        >
                          PSA {o.grade}
                        </span>
                      </div>
                    </div>
                    <div className="self-center">
                      <span className="tabular-nums text-[13px] font-bold" style={{ color: colors.green }}>
                        {formatCurrency(o.price)}
                      </span>
                    </div>
                    <div className="self-center">
                      <span className="tabular-nums text-[12px] font-semibold" style={{ color: colors.textSecondary }}>
                        {o.quantity}
                      </span>
                    </div>
                    <div className="self-center text-right">
                      <button
                        onClick={() => onCancelOrder(o.id)}
                        className="text-[11px] font-semibold transition-colors hover:text-red-400 border rounded-[6px] px-3 py-1.5"
                        style={{ color: colors.red, borderColor: colors.borderSubtle, cursor: "pointer" }}
                      >
                        Cancel Bid
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Bottom two-column section ── */}
          <div className="grid grid-cols-2 gap-5">
            {/* Category breakdown */}
            <div
              className="rounded-[10px] border p-4"
              style={{ borderColor: colors.border, background: colors.surface }}
            >
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                By Category
              </p>
              {categories.length === 0 ? (
                <p className="text-[12px]" style={{ color: colors.textMuted }}>No holdings</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {categories.map(([cat, val]) => {
                    const pct = (val / maxCatValue) * 100;
                    const portfolioPct = totalValue > 0 ? (val / totalValue) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>{cat}</span>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-[12px] font-semibold" style={{ color: colors.textPrimary }}>
                              {formatCurrency(val)}
                            </span>
                            <span className="tabular-nums text-[11px]" style={{ color: colors.textMuted }}>
                              {portfolioPct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-[6px] w-full rounded-full" style={{ background: colors.surfaceOverlay }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: colors.green, transition: "width 0.4s ease" }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Status breakdown */}
                  <div className="mt-2 border-t pt-3" style={{ borderColor: colors.border }}>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>Status</p>
                    <div className="flex gap-3">
                      {[
                        { label: "In Vault", count: inVault, color: colors.green },
                        { label: "Listed", count: listed, color: colors.textSecondary },
                        { label: "In Transit", count: inTransit, color: "#F5C842" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="flex items-center gap-1">
                          <div className="h-[6px] w-[6px] rounded-full" style={{ background: color }} />
                          <span className="text-[11px]" style={{ color: colors.textMuted }}>{label}</span>
                          <span className="tabular-nums text-[11px] font-semibold" style={{ color: colors.textPrimary }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Top performers */}
            <div
              className="rounded-[10px] border p-4"
              style={{ borderColor: colors.border, background: colors.surface }}
            >
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                Top Performers
              </p>

              {topGainers.length === 0 ? (
                <p className="text-[12px]" style={{ color: colors.textMuted }}>No data</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {topGainers.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => onSelectCard(h.id)}
                      className="flex items-center justify-between rounded-[8px] px-3 py-2 text-left transition-colors hover:bg-[#2a2a2a]"
                      style={{ background: "transparent" }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold" style={{ color: colors.textPrimary }}>
                          {h.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textMuted }}>
                          PSA {h.grade}
                        </p>
                      </div>
                      <div className="ml-2 flex flex-col items-end">
                        <span className="tabular-nums text-[12px] font-bold" style={{ color: colors.green }}>
                          +{h.gainPct.toFixed(1)}%
                        </span>
                        <span className="tabular-nums text-[10px]" style={{ color: colors.green }}>
                          +{formatCurrency(h.gain)}
                        </span>
                      </div>
                    </button>
                  ))}

                  {topLosers.length > 0 && (
                    <>
                      <div className="my-1 border-t" style={{ borderColor: colors.border }} />
                      {topLosers.map((h) => (
                        <button
                          key={h.id}
                          onClick={() => onSelectCard(h.id)}
                          className="flex items-center justify-between rounded-[8px] px-3 py-2 text-left transition-colors hover:bg-[#2a2a2a]"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold" style={{ color: colors.textPrimary }}>
                              {h.name}
                            </p>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textMuted }}>
                              PSA {h.grade}
                            </p>
                          </div>
                          <div className="ml-2 flex flex-col items-end">
                            <span className="tabular-nums text-[12px] font-bold" style={{ color: colors.red }}>
                              {h.gainPct.toFixed(1)}%
                            </span>
                            <span className="tabular-nums text-[10px]" style={{ color: colors.red }}>
                              {formatCurrency(h.gain)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── All holdings table ── */}
          <div className="mt-5 rounded-[10px] border overflow-hidden" style={{ borderColor: colors.border }}>
            <div
              className="grid grid-cols-5 border-b px-4 py-2"
              style={{ borderColor: colors.border, background: colors.surface }}
            >
              {["Card", "Grade", "Current Value", "Cost Basis", "P&L"].map((h) => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                  {h}
                </span>
              ))}
            </div>
            {holdings.map((h) => {
              const cur = priceMap[h.symbol] ?? 0;
              const gain = cur - h.acquisitionPrice;
              const gainPct = (gain / h.acquisitionPrice) * 100;
              const isG = gain >= 0;
              const gradeColor = psaGradeColor[h.grade as 8 | 9 | 10] ?? colors.textSecondary;
              return (
                <button
                  key={h.id}
                  onClick={() => onSelectCard(h.id)}
                  className="grid grid-cols-5 w-full border-b px-4 py-3 text-left transition-colors hover:bg-[#0f0f0f]"
                  style={{ borderColor: colors.borderSubtle }}
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-[12px] font-semibold" style={{ color: colors.textPrimary }}>{h.name}</p>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textMuted }}>{h.set}</p>
                  </div>
                  <div>
                    <span
                      className="inline-block rounded-[5px] px-[6px] py-[2px] text-[10px] font-bold tracking-wide"
                      style={{ background: `${gradeColor}18`, border: `1px solid ${gradeColor}44`, color: gradeColor }}
                    >
                      PSA {h.grade}
                    </span>
                  </div>
                  <span className="tabular-nums text-[13px] font-bold self-center" style={{ color: colors.textPrimary }}>
                    {formatCurrency(cur)}
                  </span>
                  <span className="tabular-nums text-[12px] self-center" style={{ color: colors.textSecondary }}>
                    {formatCurrency(h.acquisitionPrice)}
                  </span>
                  <div className="self-center">
                    <p className="tabular-nums text-[12px] font-semibold" style={{ color: isG ? colors.green : colors.red }}>
                      {isG ? "+" : ""}{formatCurrency(gain)}
                    </p>
                    <p className="tabular-nums text-[10px]" style={{ color: isG ? colors.green : colors.red }}>
                      {isG ? "+" : ""}{gainPct.toFixed(1)}%
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Active Listings (Open Asks) ── */}
          {openOrders.filter(o => o.type === "sell").length > 0 && (
            <div className="mt-5 rounded-[10px] border overflow-hidden" style={{ borderColor: colors.border }}>
              <div
                className="grid grid-cols-4 border-b px-4 py-2"
                style={{ borderColor: colors.border, background: colors.surface }}
              >
                {["Listed Card", "Order Type", "Ask Price", ""].map((h) => (
                  <span key={h} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                    {h}
                  </span>
                ))}
              </div>
              {openOrders.filter(o => o.type === "sell").map((o) => {
                const gradeColor = psaGradeColor[o.grade as 8 | 9 | 10] ?? colors.textSecondary;
                return (
                  <div
                    key={o.id}
                    className="grid grid-cols-4 w-full border-b px-4 py-3 text-left transition-colors hover:bg-[#0f0f0f]"
                    style={{ borderColor: colors.borderSubtle }}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate text-[12px] font-semibold" style={{ color: colors.textPrimary }}>{o.cardName}</p>
                      <div>
                        <span
                          className="inline-block rounded-[5px] mt-1 px-[6px] py-[2px] text-[10px] font-bold tracking-wide"
                          style={{ background: `${gradeColor}18`, border: `1px solid ${gradeColor}44`, color: gradeColor }}
                        >
                          PSA {o.grade}
                        </span>
                      </div>
                    </div>
                    <div className="self-center">
                      <span
                        className="tabular-nums text-[12px] font-semibold uppercase rounded-[6px] px-2 py-1"
                        style={{ color: colors.gold, background: colors.goldMuted }}
                      >
                        Listing
                      </span>
                    </div>
                    <div className="self-center">
                      <span className="tabular-nums text-[13px] font-bold" style={{ color: colors.textPrimary }}>
                        {formatCurrency(o.price)}
                      </span>
                      <span className="tabular-nums text-[11px] ml-1" style={{ color: colors.textMuted }}>
                        x{o.quantity}
                      </span>
                    </div>
                    <div className="self-center text-right">
                      <button
                        onClick={() => onCancelOrder(o.id)}
                        className="text-[12px] font-semibold transition-colors hover:text-red-400"
                        style={{ color: colors.textMuted }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Activity Feed ── */}
          {activities.length > 0 && (
            <div className="mt-5 rounded-[10px] border overflow-hidden" style={{ borderColor: colors.border }}>
              <div
                className="border-b px-4 py-2"
                style={{ borderColor: colors.border, background: colors.surface }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                  Recent Activity
                </span>
              </div>
              {[...activities].reverse().slice(0, 10).map((act) => {
                const iconConfig = {
                  deposit: { icon: <ArrowDownLeft size={12} />, color: colors.green, bg: colors.greenMuted },
                  listed: { icon: <Tag size={12} />, color: colors.gold, bg: colors.goldMuted },
                  cancelled: { icon: <X size={12} />, color: colors.textMuted, bg: colors.surfaceOverlay },
                  withdrawn: { icon: <ArrowUpRight size={12} />, color: colors.red, bg: "rgba(255,59,48,0.12)" },
                  shipped: { icon: <ArrowUpRight size={12} />, color: "#F5C842", bg: "rgba(245,200,66,0.15)" },
                }[act.type];

                const secondsAgo = Math.floor((Date.now() - act.timestamp.getTime()) / 1000);
                const timeLabel =
                  secondsAgo < 60 ? "just now"
                    : secondsAgo < 3600 ? `${Math.floor(secondsAgo / 60)}m ago`
                      : secondsAgo < 86400 ? `${Math.floor(secondsAgo / 3600)}h ago`
                        : `${Math.floor(secondsAgo / 86400)}d ago`;

                const description =
                  act.type === "deposit" ? `Deposited ${act.cardName} PSA ${act.grade} at ${formatCurrency(act.amount)}`
                    : act.type === "listed" ? `${act.cardName} PSA ${act.grade} listed for ${formatCurrency(act.amount)}`
                      : act.type === "cancelled" ? `Listing cancelled for ${act.cardName} PSA ${act.grade}`
                        : `${act.cardName} PSA ${act.grade} withdrawal requested`;

                return (
                  <div
                    key={act.id}
                    className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"
                    style={{ borderColor: colors.borderSubtle }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex items-center justify-center rounded-full shrink-0"
                        style={{ width: 26, height: 26, background: iconConfig.bg, color: iconConfig.color }}
                      >
                        {iconConfig.icon}
                      </div>
                      <span className="text-[12px]" style={{ color: colors.textSecondary }}>{description}</span>
                    </div>
                    <span className="ml-4 shrink-0 text-[11px] tabular-nums" style={{ color: colors.textMuted }}>
                      {timeLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Open Orders View (tab content)
// ─────────────────────────────────────────────────────────

function OpenOrdersView({ openOrders, onCancelOrder }: { openOrders: import("@/lib/portfolio-context").OpenOrder[]; onCancelOrder: (id: string) => void }) {
  if (openOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16" style={{ color: colors.textMuted }}>
        <p className="text-[14px] font-semibold">No open orders</p>
        <p className="mt-1 text-[12px]">Your limit buy and sell orders will appear here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border overflow-hidden" style={{ borderColor: colors.border }}>
      {/* Header */}
      <div className="grid grid-cols-[1fr_90px_90px_60px_80px] gap-2 px-4 py-2 border-b" style={{ borderColor: colors.borderSubtle, background: colors.surface }}>
        {["Card", "Side", "Price", "Qty", ""].map((h) => (
          <span key={h} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>{h}</span>
        ))}
      </div>
      {/* Rows */}
      {openOrders.map((o) => (
        <div key={o.id} className="grid grid-cols-[1fr_90px_90px_60px_80px] items-center gap-2 px-4 py-3 border-b last:border-b-0" style={{ borderColor: colors.borderSubtle }}>
          <div>
            <p className="text-[12px] font-semibold truncate" style={{ color: colors.textPrimary }}>{o.cardName}</p>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: colors.textMuted }}>PSA {o.grade}</p>
          </div>
          <span
            className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-bold uppercase w-fit"
            style={{
              background: o.type === "buy" ? `${colors.green}18` : `${colors.red}18`,
              color: o.type === "buy" ? colors.green : colors.red,
            }}
          >
            {o.type === "buy" ? "Limit Buy" : "Limit Sell"}
          </span>
          <span className="tabular-nums text-[13px] font-bold" style={{ color: colors.textPrimary }}>
            {formatCurrency(o.price)}
          </span>
          <span className="tabular-nums text-[12px]" style={{ color: colors.textSecondary }}>
            {o.quantity}
          </span>
          <button
            onClick={() => onCancelOrder(o.id)}
            className="rounded-[6px] px-3 py-[5px] text-[11px] font-semibold transition-colors duration-150 hover:bg-red-500/20"
            style={{ color: colors.red, border: `1px solid ${colors.red}44`, cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Detail Panel
// ─────────────────────────────────────────────────────────

interface DetailPanelProps {
  holding: VaultHolding;
  currentValue: number;
  changePct: number;
  onOpenListModal: (id: string) => void;
  onCancelListing: (id: string) => void;
  onOpenWithdrawModal: (id: string) => void;
  onOpenSubmitModal: (id: string) => void;
  onRemoveCard: (id: string) => void;
}

function DetailPanel({ holding, currentValue, changePct, onOpenListModal, onCancelListing, onOpenWithdrawModal, onOpenSubmitModal, onRemoveCard }: DetailPanelProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const officialImage = holding.imageUrl || `/cards/${holding.symbol}.svg`;
  const images = holding.rawImageUrl ? [officialImage, holding.rawImageUrl] : [officialImage];

  const [range, setRange] = useState<TimeRange>("1M");
  const chartData = generateHistory(currentValue, changePct, range, holding.symbol);
  const isUp = changePct >= 0;
  const gain = currentValue - holding.acquisitionPrice;
  const gainPct = (gain / holding.acquisitionPrice) * 100;
  const isGain = gain >= 0;
  const gradeColor = psaGradeColor[holding.grade as 8 | 9 | 10] ?? colors.textSecondary;

  const statusConfig: Record<VaultHolding["status"], { label: string; bg: string; color: string }> = {
    pending_authentication: { label: "Pending Setup", bg: "rgba(245,200,66,0.15)", color: "#F5C842" },
    shipped: { label: "Shipped", bg: "rgba(245,200,66,0.15)", color: "#F5C842" },
    received: { label: "Received", bg: "rgba(245,200,66,0.15)", color: "#F5C842" },
    authenticating: { label: "Authenticating", bg: "rgba(245,200,66,0.15)", color: "#F5C842" },
    tradable: { label: "In Vault", bg: colors.greenMuted, color: colors.green },
    in_transit: { label: "In Transit", bg: "rgba(245,200,66,0.15)", color: "#F5C842" }, // legacy/fallback for withdrawal
    withdrawn: { label: "Withdrawn", bg: colors.surfaceOverlay, color: colors.textMuted },
    listed: { label: "Listed for Sale", bg: colors.surface, color: colors.textSecondary },
    returning: { label: "Returning", bg: "rgba(59,130,246,0.15)", color: "#3B82F6" },
    disapproved: { label: "Disapproved", bg: "rgba(255,59,48,0.15)", color: colors.red },
  };

  const status = statusConfig[holding.status];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5" style={{ borderColor: colors.border }}>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-2">
            <div
              onClick={() => {
                if (images.length > 1) {
                  setActiveImageIndex((prev) => (prev + 1) % images.length);
                }
              }}
              className="shrink-0 overflow-hidden rounded-[8px]"
              style={{
                width: 120, height: 168, border: `1px solid ${colors.border}`, background: colors.surface,
                cursor: images.length > 1 ? "pointer" : "default"
              }}
            >
              {images[activeImageIndex] && (
                <Image
                  src={images[activeImageIndex]!} alt={holding.name} width={120} height={168}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} unoptimized
                />
              )}
            </div>
            {/* Carousel dots */}
            {images.length > 1 && (
              <div className="flex gap-1.5">
                {images.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: i === activeImageIndex ? colors.textPrimary : colors.borderSubtle,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-bold leading-tight tracking-tight" style={{ color: colors.textPrimary }}>
                {holding.name}
              </h1>
              <div className="rounded-[6px] px-2 py-[3px]" style={{ background: `${gradeColor}18`, border: `1px solid ${gradeColor}44` }}>
                <span className="text-[10px] font-bold tracking-wide" style={{ color: gradeColor }}>PSA {holding.grade}</span>
              </div>
            </div>
            <p className="mt-[4px] text-[11px] uppercase tracking-wider" style={{ color: colors.textMuted }}>
              {holding.set} · {holding.year}
            </p>
          </div>
        </div>
        <div className="rounded-[8px] px-3 py-[5px]" style={{ background: status.bg, border: `1px solid ${status.color}44` }}>
          <span className="text-[11px] font-semibold" style={{ color: status.color }}>{status.label}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-5 grid grid-cols-4 overflow-hidden rounded-[10px] border" style={{ borderColor: colors.border, background: colors.surface }}>
        {[
          { label: "Last Sale Price", value: formatCurrency(currentValue), valueColor: colors.textPrimary },
          { label: "Acquisition Price", value: formatCurrency(holding.acquisitionPrice), valueColor: colors.textPrimary },
          {
            label: "Gain / Loss",
            value: `${isGain ? "+" : ""}${formatCurrency(gain)} (${isGain ? "+" : ""}${gainPct.toFixed(1)}%)`,
            valueColor: isGain ? colors.green : colors.red,
          },
          holding.status === "listed" && holding.listingPrice
            ? { label: "Listing Price", value: formatCurrency(holding.listingPrice), valueColor: colors.gold }
            : { label: "Date Deposited", value: holding.dateDeposited, valueColor: colors.textPrimary },
        ].map((stat, i) => (
          <div key={stat.label} className={cn("flex flex-col gap-[4px] px-4 py-3", i < 3 && "border-r")} style={{ borderColor: colors.borderSubtle }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>{stat.label}</span>
            <span className="tabular-nums text-[13px] font-semibold" style={{ color: stat.valueColor }}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-5 flex gap-3">
        {["tradable"].includes(holding.status) && (
          <button onClick={() => onOpenListModal(holding.id)} className="flex-1 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold transition-colors duration-150" style={{ background: colors.green, color: colors.textInverse, cursor: "pointer", border: `1px solid ${colors.green}` }}>
            List for Sale
          </button>
        )}
        {holding.status === "listed" && (
          <button onClick={() => onCancelListing(holding.id)} className="flex-1 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold transition-colors duration-150" style={{ background: "transparent", color: colors.red, cursor: "pointer", border: `1px solid ${colors.red}` }}>
            Cancel Listing
          </button>
        )}
        {holding.status === "pending_authentication" && (
          <button onClick={() => onOpenSubmitModal(holding.id)} className="flex-1 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold transition-colors duration-150" style={{ background: colors.green, color: colors.textInverse, cursor: "pointer", border: `1px solid ${colors.green}` }}>
            Submit to tash.
          </button>
        )}
        {["shipped", "received", "authenticating", "in_transit"].includes(holding.status) && (
          <button disabled className="flex-1 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold" style={{ background: colors.surface, color: colors.textMuted, cursor: "not-allowed", border: `1px solid ${colors.border}` }}>
            List for Sale
          </button>
        )}
        {["tradable"].includes(holding.status) && (
          <button onClick={() => onOpenWithdrawModal(holding.id)} className="flex-1 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold transition-colors duration-150" style={{ background: colors.surface, color: colors.textPrimary, cursor: "pointer", border: `1px solid ${colors.border}` }}>
            Request Withdrawal
          </button>
        )}
        {holding.status === "listed" && (
          <button disabled className="flex-1 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold" style={{ background: colors.surface, color: colors.textMuted, cursor: "not-allowed", border: `1px solid ${colors.borderSubtle}` }}>
            Request Withdrawal
          </button>
        )}
        {["pending_authentication", "shipped", "received", "authenticating", "in_transit"].includes(holding.status) && (
          <button disabled className="flex-1 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold" style={{ background: colors.surface, color: colors.textMuted, cursor: "not-allowed", border: `1px solid ${colors.borderSubtle}` }}>
            {status.label}
          </button>
        )}
        {holding.status === "disapproved" && (
          <>
            <Link
              href={`/scan?reupload=${holding.id}`}
              className="flex-1 flex items-center justify-center rounded-[10px] px-4 py-[10px] text-[13px] font-semibold transition-colors duration-150"
              style={{ background: colors.green, color: colors.textInverse, border: `1px solid ${colors.green}` }}
            >
              Re-scan Card
            </Link>
            <button
              onClick={() => onRemoveCard(holding.id)}
              className="flex-1 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold transition-colors duration-150"
              style={{ background: "transparent", color: colors.red, cursor: "pointer", border: `1px solid ${colors.red}` }}
            >
              Remove Card
            </button>
          </>
        )}
      </div>

      {/* Price History Chart */}
      <div className="mt-6">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>Price History</p>
        <PriceChart data={chartData} isUp={isUp} range={range} onRangeChange={setRange} />
      </div>
      <p className="mt-5 text-[11px]" style={{ color: colors.textMuted }}>{holding.certNumber}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// List for Sale Modal
// ─────────────────────────────────────────────────────────

interface ListModalProps {
  holding: VaultHolding;
  price: string;
  marketPrice: number;
  onPriceChange: (p: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function ListModal({ holding, price, marketPrice, onPriceChange, onCancel, onConfirm }: ListModalProps) {
  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>List for Sale</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 4, display: "flex", alignItems: "center" }}><X size={16} /></button>
      </div>
      <p style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 20 }}>{holding.name} · PSA {holding.grade}</p>
      <label style={{ display: "block", color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Asking Price</label>
      <input type="number" value={price} onChange={(e) => onPriceChange(e.target.value)} style={{ width: "100%", background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textPrimary, fontSize: 14, fontWeight: 600, padding: "10px 12px", outline: "none", boxSizing: "border-box" }} />
      <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, marginBottom: 24 }}>Market price: {formatCurrency(marketPrice)}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.textSecondary, fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: "pointer" }}>Cancel</button>
        <button onClick={onConfirm} style={{ flex: 1, background: colors.green, border: `1px solid ${colors.green}`, borderRadius: 10, color: colors.textInverse, fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: "pointer" }}>Confirm Listing →</button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Request Withdrawal Modal
// ─────────────────────────────────────────────────────────

interface WithdrawModalProps {
  holding: VaultHolding;
  currentValue: number;
  onCancel: () => void;
  onConfirm: (address: string) => void;
}

function WithdrawModal({ holding, currentValue, onCancel, onConfirm }: WithdrawModalProps) {
  const fee = currentValue * 0.035;
  const net = currentValue * 0.965;
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const canSubmit = street.trim() && city.trim() && state.trim() && zip.trim();
  const inputStyle: React.CSSProperties = { width: "100%", background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textPrimary, fontSize: 13, padding: "9px 12px", outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };

  function handleConfirm() {
    if (!canSubmit) return;
    const fullAddress = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;
    onConfirm(fullAddress);
  }

  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>Request Withdrawal</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 4, display: "flex", alignItems: "center" }}><X size={16} /></button>
      </div>
      <p style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 20 }}>{holding.name} · PSA {holding.grade}</p>
      <div style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: colors.textSecondary, fontSize: 13 }}>Card Value</span>
          <span style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 600 }}>{formatCurrency(currentValue)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ color: colors.textSecondary, fontSize: 13 }}>Withdrawal Fee</span>
          <span style={{ color: colors.gold, fontSize: 13, fontWeight: 700 }}>−{formatCurrency(fee)} <span style={{ fontSize: 11, fontWeight: 500 }}>(3.5%)</span></span>
        </div>
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 600 }}>You Receive</span>
          <span style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 700 }}>{formatCurrency(net)}</span>
        </div>
      </div>

      {/* Shipping Address */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Shipping Address</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="text" placeholder="Street Address" value={street} onChange={(e) => setStreet(e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: 10 }}>
            <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
            <input type="text" placeholder="State" value={state} onChange={(e) => setState(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <input type="text" placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>
      </div>

      <div style={{ background: colors.goldMuted, border: `1px solid ${colors.gold}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
        <p style={{ color: colors.gold, fontSize: 12, lineHeight: 1.5 }}>⚠ Physical delivery takes 7–14 business days</p>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.textSecondary, fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: "pointer" }}>Cancel</button>
        <button onClick={handleConfirm} style={{ flex: 1, background: canSubmit ? colors.gold : colors.surface, border: `1px solid ${canSubmit ? colors.gold : colors.border}`, borderRadius: 10, color: canSubmit ? colors.textInverse : colors.textMuted, fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: canSubmit ? "pointer" : "not-allowed" }}>Confirm Withdrawal →</button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Deposit Card Modal
// ─────────────────────────────────────────────────────────

interface DepositModalProps {
  assets: AssetData[];
  onCancel: () => void;
  onConfirm: (form: DepositForm) => void;
}

function DepositModal({ assets, onCancel, onConfirm }: DepositModalProps) {
  const [form, setForm] = useState<DepositForm>({ symbol: assets[0]?.symbol ?? "", grade: 10, acquisitionPrice: 0, certNumber: "", photoUrl: null });
  const [photoTab, setPhotoTab] = useState<"upload" | "scan">("upload");
  const [dragOver, setDragOver] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (photoTab === "scan" && !form.photoUrl) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => { streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream; })
        .catch(() => setCameraError("Camera access denied or unavailable"));
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [photoTab, form.photoUrl]);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setForm((f) => ({ ...f, photoUrl: URL.createObjectURL(file) }));
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setForm((f) => ({ ...f, photoUrl: URL.createObjectURL(blob) }));
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }, "image/jpeg");
  }

  const pokemonAssets = assets.filter((a) => a.category === "pokemon");
  const sportsAssets = assets.filter((a) => a.category !== "pokemon");
  const selectedAsset = assets.find((a) => a.symbol === form.symbol);
  const canSubmit = !!form.symbol && form.acquisitionPrice > 0;

  const lbl: React.CSSProperties = { display: "block", color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>Deposit Card</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 4, display: "flex", alignItems: "center" }}><X size={16} /></button>
      </div>
      <p style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 20 }}>Add a graded card to your portfolio with live price tracking</p>

      {/* Photo section */}
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Card Photo</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {(["upload", "scan"] as const).map((tab) => (
            <button key={tab} onClick={() => { setPhotoTab(tab); setCameraError(null); }}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${photoTab === tab ? colors.green : colors.border}`, background: photoTab === tab ? colors.greenMuted : "transparent", color: photoTab === tab ? colors.green : colors.textSecondary, cursor: "pointer" }}>
              {tab === "upload" ? <Upload size={12} /> : <Camera size={12} />}
              {tab === "upload" ? "Upload" : "Scan"}
            </button>
          ))}
        </div>

        {photoTab === "upload" && (
          <>
            {form.photoUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 80, height: 112, borderRadius: 6, overflow: "hidden", border: `1px solid ${colors.border}`, flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.photoUrl} alt="Card" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div>
                  <p style={{ color: colors.green, fontSize: 12, fontWeight: 600 }}>Photo ready</p>
                  <button onClick={() => setForm((f) => ({ ...f, photoUrl: null }))} style={{ marginTop: 6, fontSize: 11, color: colors.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>× Clear photo</button>
                </div>
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                style={{ border: `2px dashed ${dragOver ? colors.green : colors.border}`, borderRadius: 10, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: dragOver ? colors.greenMuted : "transparent", transition: "all 0.15s" }}>
                <Upload size={20} style={{ color: colors.textMuted, margin: "0 auto 8px" }} />
                <p style={{ color: colors.textSecondary, fontSize: 13 }}>Drag photo here or <span style={{ color: colors.green }}>browse</span></p>
                <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>JPG, PNG, HEIC — any size</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </>
        )}

        {photoTab === "scan" && (
          <>
            {form.photoUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 80, height: 112, borderRadius: 6, overflow: "hidden", border: `1px solid ${colors.border}`, flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.photoUrl} alt="Card" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div>
                  <p style={{ color: colors.green, fontSize: 12, fontWeight: 600 }}>Photo captured</p>
                  <button onClick={() => { setForm((f) => ({ ...f, photoUrl: null })); setCameraError(null); }} style={{ marginTop: 6, fontSize: 11, color: colors.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>↺ Retake</button>
                </div>
              </div>
            ) : cameraError ? (
              <div style={{ textAlign: "center", padding: "20px 12px", borderRadius: 10, border: `1px solid ${colors.border}` }}>
                <p style={{ color: colors.red, fontSize: 13, marginBottom: 10 }}>{cameraError}</p>
                <button onClick={() => { setCameraError(null); setPhotoTab("upload"); }} style={{ color: colors.green, fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>Use Upload instead →</button>
              </div>
            ) : (
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#000", aspectRatio: "4/3" }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {(["tl", "tr", "bl", "br"] as const).map((pos) => (
                  <div key={pos} style={{ position: "absolute", width: 22, height: 22, borderColor: colors.green, borderStyle: "solid", borderWidth: 0, ...(pos === "tl" && { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 }), ...(pos === "tr" && { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 }), ...(pos === "bl" && { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 }), ...(pos === "br" && { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 }) }} />
                ))}
                <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
                  <button onClick={capturePhoto} aria-label="Capture photo" style={{ width: 52, height: 52, borderRadius: "50%", background: colors.green, border: "3px solid rgba(255,255,255,0.9)", cursor: "pointer", boxShadow: `0 0 20px rgba(0,200,5,0.6)` }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card selector */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Card</label>
        <select value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
          style={{ width: "100%", background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textPrimary, fontSize: 13, padding: "9px 32px 9px 12px", outline: "none", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235A5A5A' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
          {pokemonAssets.length > 0 && <optgroup label="Pokémon">{pokemonAssets.map((a) => <option key={a.symbol} value={a.symbol}>{a.name} · PSA {a.grade} · {a.set}</option>)}</optgroup>}
          {sportsAssets.length > 0 && <optgroup label="Sports">{sportsAssets.map((a) => <option key={a.symbol} value={a.symbol}>{a.name} · PSA {a.grade} · {a.set}</option>)}</optgroup>}
        </select>
        {selectedAsset && <p style={{ marginTop: 5, fontSize: 11, color: colors.textMuted }}>{selectedAsset.set} · {selectedAsset.category === "pokemon" ? "Pokémon" : "Sports"}</p>}
      </div>

      {/* Grade pills */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>PSA Grade</label>
        <div style={{ display: "flex", gap: 8 }}>
          {([10, 9, 8] as const).map((g) => (
            <button key={g} onClick={() => setForm((f) => ({ ...f, grade: g }))}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${form.grade === g ? colors.green : colors.border}`, background: form.grade === g ? colors.greenMuted : "transparent", color: form.grade === g ? colors.green : colors.textSecondary }}>
              PSA {g}
            </button>
          ))}
        </div>
      </div>

      {/* Acquisition price */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Acquisition Price</label>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: colors.textMuted, fontSize: 13, pointerEvents: "none" }}>$</span>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={form.acquisitionPrice || ""} onChange={(e) => setForm((f) => ({ ...f, acquisitionPrice: parseFloat(e.target.value) || 0 }))}
            style={{ width: "100%", background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textPrimary, fontSize: 14, fontWeight: 600, padding: "9px 12px 9px 24px", outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>

      {/* PSA cert */}
      <div style={{ marginBottom: 22 }}>
        <label style={lbl}>PSA Cert # <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10 }}>(optional)</span></label>
        <input type="text" placeholder="Auto-generated if blank" value={form.certNumber} onChange={(e) => setForm((f) => ({ ...f, certNumber: e.target.value }))}
          style={{ width: "100%", background: colors.surfaceOverlay, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textPrimary, fontSize: 13, padding: "9px 12px", outline: "none", boxSizing: "border-box" }} />
      </div>

      {/* Footer */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.textSecondary, fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: "pointer" }}>Cancel</button>
        <button onClick={() => canSubmit && onConfirm(form)} style={{ flex: 2, background: canSubmit ? colors.green : colors.surface, border: `1px solid ${canSubmit ? colors.green : colors.border}`, borderRadius: 10, color: canSubmit ? colors.textInverse : colors.textMuted, fontSize: 13, fontWeight: 600, padding: "10px 16px", cursor: canSubmit ? "pointer" : "not-allowed" }}>
          Deposit Card →
        </button>
      </div>
    </>
  );
}

