"use client";

/**
 * SimpleView — Portfolio-first casual experience.
 *
 * Inspired by Robinhood:
 *   - Portfolio value at a glance
 *   - Your holdings front and center, tap to open trade modal
 *   - Search to discover new cards
 *   - Market list below for browsing
 */

import { useState, useMemo, useEffect } from "react";
import { Search, ChevronRight, CheckCircle, Loader2, Lock, X, Filter } from "lucide-react";
import { colors } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { SparklineChart } from "./SparklineChart";
import type { VaultHolding } from "@/lib/vault-data";
import type { AssetData, PricePoint } from "@/lib/market-data";

import { usePortfolio } from "@/lib/portfolio-context";
import { api } from "@/lib/api";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface SimpleViewProps {
  assets: AssetData[];
  sparklines: Record<string, PricePoint[]>;
  flashMap: Record<string, "up" | "down">;
  onRequestSignIn: () => void;
  showNonTradable: boolean;
  onToggleShowNonTradable: () => void;
}

type TradeSide = "buy" | "sell";

// ─────────────────────────────────────────────────────────
// Fill likelihood
// ─────────────────────────────────────────────────────────

function getFillLikelihood(
  price: number,
  side: TradeSide,
  bestBid: number,
  bestAsk: number
): { pct: number; label: string; barColor: string; hint: string } {
  let pct: number;

  // More lenient: give credit even outside the spread, with a 15% buffer
  if (side === "buy") {
    if (price >= bestAsk) pct = 1;
    else if (price <= bestBid * 0.85) pct = 0.08;
    else pct = 0.15 + 0.85 * ((price - bestBid * 0.85) / (bestAsk - bestBid * 0.85));
  } else {
    if (price <= bestBid) pct = 1;
    else if (price >= bestAsk * 1.15) pct = 0.08;
    else pct = 0.15 + 0.85 * ((bestAsk * 1.15 - price) / (bestAsk * 1.15 - bestBid));
  }

  pct = Math.min(1, Math.max(0.05, pct));

  const label =
    pct >= 0.90 ? "Immediate fill" :
      pct >= 0.55 ? "High" :
        pct >= 0.25 ? "Medium" :
          pct >= 0.10 ? "Low" : "Very low";

  const barColor =
    pct >= 0.55 ? colors.green :
      pct >= 0.25 ? "#f59e0b" : colors.red;

  const hint =
    side === "buy"
      ? pct >= 0.90
        ? "Your bid meets or exceeds the ask — this fills immediately."
        : "Raise your bid closer to the ask to increase fill likelihood."
      : pct >= 0.90
        ? "Your ask meets or is below the bid — this fills immediately."
        : "Lower your ask closer to the bid to increase fill likelihood.";

  return { pct, label, barColor, hint };
}

// ─────────────────────────────────────────────────────────
// Trade modal
// ─────────────────────────────────────────────────────────

function TradeModal({
  asset,
  initialSide,
  allowSell,
  onClose,
}: {
  asset: AssetData;
  initialSide: TradeSide;
  allowSell: boolean;
  onClose: () => void;
}) {
  const { user, updateBalance } = useAuth();

  const [bestBid, setBestBid] = useState(asset.price);
  const [bestAsk, setBestAsk] = useState(asset.price);

  useEffect(() => {
    let isActive = true;
    import("@/lib/db/orders").then(({ fetchOrderBook }) => {
      fetchOrderBook(asset.symbol).then((book) => {
        if (!isActive) return;
        setBestBid(book.bids[0]?.price ?? asset.price);
        setBestAsk(book.asks[0]?.price ?? asset.price);
      });
    });
    return () => { isActive = false; };
  }, [asset.symbol, asset.price]);

  const [side, setSide] = useState<TradeSide>(initialSide);
  const [priceStr, setPriceStr] = useState(() =>
    (initialSide === "buy" ? bestAsk : bestBid).toFixed(2)
  );
  const [quantity, setQuantity] = useState(1);
  const [stage, setStage] = useState<"form" | "submitting" | "confirmed" | "error">("form");
  const [errorMsg, setErrorMsg] = useState("");


  // Reset price to market default when side changes
  useEffect(() => {
    setPriceStr((side === "buy" ? bestAsk : bestBid).toFixed(2));
  }, [side, bestAsk, bestBid]);

  const price = parseFloat(priceStr) || 0;
  const fill = getFillLikelihood(price, side, bestBid, bestAsk);
  const total = price * quantity;
  const accent = side === "buy" ? colors.green : colors.red;
  const canAfford = side === "sell" || (user?.cashBalance ?? 0) >= total;

  async function handleConfirm() {
    if (!user) return;
    setStage("submitting");
    try {
      const res = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          symbol: asset.symbol,
          priceUsd: price,
          isBuy: side === "buy",
          quantity,
          cardName: asset.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Order failed");

      if (side === "buy") {
        updateBalance(-total);
      }

      setStage("confirmed");
      setTimeout(onClose, 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-[24px] p-6 sm:rounded-[20px] overflow-y-auto"
        style={{ background: colors.surface, border: `1px solid ${colors.border}`, maxHeight: "calc(100dvh - 40px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[16px] font-bold leading-tight" style={{ color: colors.textPrimary }}>
                {asset.name}
              </p>
              <span
                className="shrink-0 rounded-[4px] px-[6px] py-[2px] text-[9px] font-bold tracking-wide"
                style={{ background: colors.greenMuted, color: colors.green }}
              >
                PSA {asset.grade}
              </span>
            </div>
            <p className="mt-[3px] text-[12px]" style={{ color: colors.textMuted }}>{asset.set}</p>
          </div>
          <button onClick={onClose} className="mt-0.5 p-1">
            <X size={16} strokeWidth={2} style={{ color: colors.textMuted }} />
          </button>
        </div>

        {/* ── Submitting ── */}
        {stage === "submitting" && (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 size={20} strokeWidth={1.5} className="animate-spin" style={{ color: colors.green }} />
            <span className="text-[13px]" style={{ color: colors.textMuted }}>Submitting order…</span>
          </div>
        )}

        {/* ── Confirmed ── */}
        {stage === "confirmed" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle size={36} strokeWidth={1.5} style={{ color: colors.green }} />
            <p className="text-[16px] font-bold" style={{ color: colors.textPrimary }}>Order placed</p>
            <p className="text-[12px]" style={{ color: colors.textMuted }}>
              Your {side} order has been submitted.
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {stage === "error" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-[13px]" style={{ color: colors.red }}>{errorMsg}</p>
            <button onClick={() => setStage("form")} className="text-[12px]" style={{ color: colors.textMuted }}>
              Try again
            </button>
          </div>
        )}

        {/* ── Form ── */}
        {stage === "form" && (
          <>
            {/* Buy / Sell toggle */}
            {allowSell && (
              <div className="mb-5 flex rounded-[10px] p-[3px]" style={{ background: colors.surfaceOverlay }}>
                {(["buy", "sell"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className="flex-1 rounded-[8px] py-[9px] text-[13px] font-bold capitalize transition-all"
                    style={{
                      background: side === s
                        ? (s === "buy" ? colors.greenMuted : colors.redMuted)
                        : "transparent",
                      color: side === s
                        ? (s === "buy" ? colors.green : colors.red)
                        : colors.textMuted,
                      border: side === s
                        ? `1px solid ${(s === "buy" ? colors.green : colors.red)}44`
                        : "1px solid transparent",
                    }}
                  >
                    {s === "buy" ? "Buy" : "Sell"}
                  </button>
                ))}
              </div>
            )}

            {/* Bid / Ask context strip */}
            <div
              className="mb-4 grid grid-cols-3 rounded-[10px] px-3 py-[10px]"
              style={{ background: colors.surfaceOverlay }}
            >
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                  Best Bid
                </p>
                <p className="tabular-nums text-[13px] font-bold" style={{ color: colors.green }}>
                  {formatCurrency(bestBid)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                  Spread
                </p>
                <p className="tabular-nums text-[11px] font-semibold" style={{ color: colors.textSecondary }}>
                  {(bestAsk > 0 ? ((Math.max(0, bestAsk - bestBid)) / bestAsk) * 100 : 0).toFixed(2)}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                  Best Ask
                </p>
                <p className="tabular-nums text-[13px] font-bold" style={{ color: colors.red }}>
                  {formatCurrency(bestAsk)}
                </p>
              </div>
            </div>

            {/* Price input */}
            <div className="mb-4">
              <label
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider"
                style={{ color: colors.textMuted }}
              >
                Your {side === "buy" ? "Bid" : "Ask"} price
              </label>
              <div
                className="flex items-center gap-2 rounded-[10px] px-4 py-[12px]"
                style={{
                  background: colors.surfaceOverlay,
                  border: `1px solid ${colors.border}`,
                  outline: "none",
                }}
              >
                <span className="text-[15px] font-semibold" style={{ color: colors.textMuted }}>$</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  onBlur={() => {
                    const n = parseFloat(priceStr);
                    if (!isNaN(n) && n > 0) setPriceStr(n.toFixed(2));
                  }}
                  className="flex-1 bg-transparent tabular-nums text-[17px] font-bold outline-none"
                  style={{ color: colors.textPrimary }}
                />
              </div>
            </div>

            {/* Fill likelihood */}
            <div
              className="mb-4 rounded-[10px] px-4 py-3"
              style={{ background: colors.surfaceOverlay }}
            >
              <div className="mb-[7px] flex items-center justify-between">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: colors.textMuted }}
                >
                  Fill likelihood
                </span>
                <span className="text-[12px] font-bold" style={{ color: fill.barColor }}>
                  {fill.label} · {Math.round(fill.pct * 100)}%
                </span>
              </div>
              <div
                className="h-[5px] overflow-hidden rounded-full"
                style={{ background: colors.border }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${fill.pct * 100}%`, background: fill.barColor }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-snug" style={{ color: colors.textMuted }}>
                {fill.hint}
              </p>
            </div>

            {/* Quantity */}
            <div className="mb-4 flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[20px] font-bold"
                style={{
                  background: colors.surfaceRaised,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                }}
              >
                −
              </button>
              <div className="flex-1 text-center">
                <p className="tabular-nums text-[22px] font-bold" style={{ color: colors.textPrimary }}>
                  {quantity}
                </p>
                <p className="text-[10px]" style={{ color: colors.textMuted }}>copies</p>
              </div>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[20px] font-bold"
                style={{
                  background: colors.surfaceRaised,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                }}
              >
                +
              </button>
            </div>

            {/* Total */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: colors.textSecondary }}>
                {side === "buy" ? "Est. total" : "You receive"}
              </span>
              <span className="tabular-nums text-[17px] font-bold" style={{ color: accent }}>
                {formatCurrency(total)}
              </span>
            </div>

            {user && side === "buy" && (
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px]" style={{ color: colors.textMuted }}>Available cash</span>
                <span
                  className="tabular-nums text-[11px] font-semibold"
                  style={{ color: colors.textSecondary }}
                >
                  {formatCurrency(user.cashBalance)}
                </span>
              </div>
            )}

            <div className="mt-6 w-full pb-12">
              <button
                onClick={handleConfirm}
                disabled={!canAfford || price <= 0}
                className="w-full rounded-[12px] py-[16px] text-[15px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: accent, color: colors.textInverse }}
              >
                {!canAfford
                  ? "Insufficient funds"
                  : `Place ${side === "buy" ? "bid" : "ask"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Holding row
// ─────────────────────────────────────────────────────────

function HoldingRow({
  holding,
  asset,
  sparkline,
  flash,
  onTrade,
  onRequestSignIn,
  isAuthenticated,
}: {
  holding: VaultHolding;
  asset: AssetData;
  sparkline: PricePoint[];
  flash: "up" | "down" | undefined;
  onTrade: () => void;
  onRequestSignIn: () => void;
  isAuthenticated: boolean;
}) {
  const gainLoss = asset.price - holding.acquisitionPrice;
  const gainPct = (gainLoss / holding.acquisitionPrice) * 100;
  const isGain = gainLoss >= 0;

  function handleClick() {
    if (!isAuthenticated) { onRequestSignIn(); return; }
    onTrade();
  }

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-3 border-b px-5 py-4 text-left transition-colors hover:bg-[#0f0f0f]"
      style={{ borderColor: colors.borderSubtle }}
    >
      {/* Card thumbnail */}
      <div
        className="shrink-0 overflow-hidden rounded-[6px]"
        style={{
          width: 40, height: 56,
          background: colors.surfaceOverlay,
          border: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <img
          src={asset.imageUrl || `/cards/${asset.symbol}.svg`}
          alt={holding.name}
          className="h-full w-full"
          style={{ objectFit: 'cover', imageRendering: 'auto' }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      </div>
      {/* Left: name + grade + gain */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-semibold" style={{ color: colors.textPrimary }}>
            {holding.name}
          </p>
          <span
            className="shrink-0 rounded-[4px] px-[6px] py-[2px] text-[9px] font-bold tracking-wide"
            style={{ background: colors.greenMuted, color: colors.green }}
          >
            PSA {holding.grade}
          </span>
        </div>
        <p className="mt-[3px] text-[12px]" style={{ color: isGain ? colors.green : colors.red }}>
          {isGain ? "+" : ""}{formatCurrency(gainLoss)} ({isGain ? "+" : ""}{gainPct.toFixed(2)}%)
        </p>
      </div>

      {/* Center: sparkline */}
      <SparklineChart data={sparkline} isUp={asset.change >= 0} width={60} height={28} />

      {/* Right: price + chevron */}
      <div className="shrink-0 text-right">
        <p
          className="tabular-nums text-[14px] font-bold"
          style={{
            color: flash ? (flash === "up" ? colors.green : colors.red) : colors.textPrimary,
            transition: "color 0.35s ease",
          }}
        >
          {formatCurrency(asset.price, { compact: true })}
        </p>
        <p className="mt-[2px] tabular-nums text-[11px]" style={{ color: asset.change >= 0 ? colors.green : colors.red }}>
          {asset.change >= 0 ? "+" : ""}{asset.changePct.toFixed(2)}% today
        </p>
      </div>

      <ChevronRight
        size={14}
        strokeWidth={2}
        style={{ color: colors.textMuted, flexShrink: 0 }}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// Market row
// ─────────────────────────────────────────────────────────

function MarketRow({
  asset,
  sparkline,
  flash,
  onTrade,
  onRequestSignIn,
  isAuthenticated,
}: {
  asset: AssetData;
  sparkline: PricePoint[];
  flash: "up" | "down" | undefined;
  onTrade: () => void;
  onRequestSignIn: () => void;
  isAuthenticated: boolean;
}) {
  const isUp = asset.change >= 0;

  return (
    <button
      onClick={() => {
        if (!isAuthenticated) { onRequestSignIn(); return; }
        onTrade();
      }}
      className="flex w-full items-center gap-3 border-b px-5 py-[14px] text-left transition-colors hover:bg-[#0f0f0f]"
      style={{ borderColor: colors.borderSubtle }}
    >
      {/* Card thumbnail */}
      <div
        className="shrink-0 overflow-hidden rounded-[6px]"
        style={{
          width: 40, height: 56,
          background: colors.surfaceOverlay,
          border: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <img
          src={asset.imageUrl || `/cards/${asset.symbol}.svg`}
          alt={asset.name}
          className="h-full w-full"
          style={{ objectFit: 'cover', imageRendering: 'auto' }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-semibold" style={{ color: colors.textPrimary }}>
            {asset.name}
          </p>
          <span
            className="shrink-0 rounded-[4px] px-[6px] py-[2px] text-[9px] font-bold tracking-wide"
            style={{ background: colors.surfaceRaised, color: colors.textMuted }}
          >
            PSA {asset.grade}
          </span>
          {!asset.hasLiquidity && (
            <span
              className="shrink-0 rounded-[4px] px-[4px] py-[2px] text-[8px] font-bold tracking-widest uppercase"
              style={{ background: colors.surfaceRaised, color: colors.textMuted }}
            >
              Not Traded
            </span>
          )}
        </div>
        <p className="mt-[2px] text-[11px]" style={{ color: colors.textMuted }}>{asset.set}</p>
      </div>

      <SparklineChart data={sparkline} isUp={isUp} width={56} height={24} />

      <div className="shrink-0 text-right">
        <p
          className="tabular-nums text-[14px] font-bold"
          style={{
            color: flash ? (flash === "up" ? colors.green : colors.red) : colors.textPrimary,
            transition: "color 0.35s ease",
          }}
        >
          {formatCurrency(asset.price, { compact: true })}
        </p>
        <p className="mt-[2px] tabular-nums text-[11px] font-semibold" style={{ color: isUp ? colors.green : colors.red }}>
          {isUp ? "+" : ""}{asset.changePct.toFixed(2)}%
        </p>
      </div>

      <ChevronRight size={14} strokeWidth={2} style={{ color: colors.textMuted, flexShrink: 0 }} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// SimpleView
// ─────────────────────────────────────────────────────────

export function SimpleView({ assets, sparklines, flashMap, onRequestSignIn, showNonTradable, onToggleShowNonTradable }: SimpleViewProps) {
  const { user, isAuthenticated } = useAuth();
  const [query, setQuery] = useState("");
  const [tradeModal, setTradeModal] = useState<{
    asset: AssetData;
    allowSell: boolean;
  } | null>(null);

  // Match vault holdings to live asset prices
  const { holdings: vaultHoldings } = usePortfolio();
  const holdings = useMemo(() =>
    vaultHoldings.map((h) => ({
      holding: h,
      asset: assets.find((a) => a.symbol === h.symbol),
    })).filter((h): h is { holding: VaultHolding; asset: AssetData } => !!h.asset),
    [assets, vaultHoldings]
  );

  // Portfolio math
  const holdingsValue = holdings.reduce((sum, { asset }) => sum + asset.price, 0);
  const cashBalance = user?.cashBalance ?? 0;
  const totalValue = cashBalance + holdingsValue;
  const dayGain = holdings.reduce((sum, { asset }) => sum + asset.change, 0);
  const dayGainPct = holdingsValue > 0 ? (dayGain / holdingsValue) * 100 : 0;
  const isDayUp = dayGain >= 0;

  const portfolioSymbols = new Set(vaultHoldings.map((h) => h.symbol));

  // Market assets — exclude holdings, filter by search or showNonTradable toggle
  const marketAssets = useMemo(() => {
    // 1. Exclude cards already in the user's portfolio
    const nonPortfolio = assets.filter((a) => !portfolioSymbols.has(a.symbol));

    // 2. If searching, show all matching cards regardless of liquidity
    if (query.trim()) {
      const q = query.toLowerCase();
      return assets.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.set.toLowerCase().includes(q) ||
          a.symbol.toLowerCase().includes(q)
      );
    }

    // 3. If not searching, respect the liquidity filter
    return showNonTradable ? nonPortfolio : nonPortfolio.filter(a => a.hasLiquidity);
  }, [assets, query, portfolioSymbols, showNonTradable]);

  // Keep modal asset price live
  const modalAsset = tradeModal
    ? assets.find((a) => a.symbol === tradeModal.asset.symbol) ?? tradeModal.asset
    : null;

  return (
    <div className="mx-auto max-w-2xl">

      {/* ── Portfolio summary ──────────────────────────── */}
      <div className="px-5 pb-5 pt-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
          Portfolio Value
        </p>
        <p className="tabular-nums text-[36px] font-bold leading-none tracking-tight" style={{ color: colors.textPrimary }}>
          {formatCurrency(totalValue)}
        </p>
        <p className="mt-2 text-[14px] font-medium" style={{ color: isDayUp ? colors.green : colors.red }}>
          {isDayUp ? "+" : ""}{formatCurrency(dayGain)} ({isDayUp ? "+" : ""}{dayGainPct.toFixed(2)}%) today
        </p>
        {!isAuthenticated && (
          <button
            onClick={onRequestSignIn}
            className="mt-4 flex items-center gap-2 rounded-[12px] px-5 py-[11px] text-[14px] font-bold transition-all active:scale-[0.98]"
            style={{ background: colors.green, color: colors.textInverse }}
          >
            <Lock size={14} strokeWidth={2.5} />
            Sign In to Trade
          </button>
        )}
      </div>

      {/* ── Search ────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <div
          className="flex items-center gap-3 rounded-[12px] px-4 py-[11px]"
          style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
        >
          <Search size={15} strokeWidth={2} style={{ color: colors.textMuted, flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search cards…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[14px]"
            style={{ color: colors.textPrimary }}
          />
          {query && (
            <button onClick={() => setQuery("")}>
              <X size={14} strokeWidth={2} style={{ color: colors.textMuted }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Holdings ──────────────────────────────────── */}
      {!query && (
        <section>
          <div className="flex items-center justify-between px-5 pb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: colors.textMuted }}>
              Your Portfolio
            </h2>
            <span className="text-[11px]" style={{ color: colors.textMuted }}>
              {holdings.length} positions
            </span>
          </div>

          <div
            className="mx-5 mb-6 overflow-hidden rounded-[14px] border"
            style={{ borderColor: colors.border, background: colors.background }}
          >
            {holdings.map(({ holding, asset }) => (
              <HoldingRow
                key={holding.id}
                holding={holding}
                asset={asset}
                sparkline={sparklines[asset.symbol] ?? []}
                flash={flashMap[asset.symbol]}
                onTrade={() => setTradeModal({ asset, allowSell: true })}
                onRequestSignIn={onRequestSignIn}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Market ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between px-5 pb-2">
          <div className="flex items-center gap-4">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: colors.textMuted }}>
              {query ? `Results for "${query}"` : "Market"}
            </h2>
            <label
              className="flex items-center gap-[6px] cursor-pointer mt-[1px]"
              title={showNonTradable ? "Hide non-tradable" : "Show non-tradable"}
            >
              <input
                type="checkbox"
                checked={showNonTradable}
                onChange={onToggleShowNonTradable}
                className="w-3 h-3 rounded-[3px] border-none bg-[#111111] accent-[#22c55e] cursor-pointer"
                style={{ border: `1px solid ${colors.borderSubtle}` }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                Show all
              </span>
            </label>
          </div>
          <span className="text-[11px]" style={{ color: colors.textMuted }}>
            {marketAssets.length} cards
          </span>
        </div>

        <div
          className="mx-5 mb-8 overflow-hidden rounded-[14px] border"
          style={{ borderColor: colors.border, background: colors.background }}
        >
          {marketAssets.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[14px]" style={{ color: colors.textMuted }}>
                No cards match &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            marketAssets.map((asset) => (
              <MarketRow
                key={asset.symbol}
                asset={asset}
                sparkline={sparklines[asset.symbol] ?? []}
                flash={flashMap[asset.symbol]}
                onTrade={() => setTradeModal({ asset, allowSell: false })}
                onRequestSignIn={onRequestSignIn}
                isAuthenticated={isAuthenticated}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Trade modal ───────────────────────────────── */}
      {tradeModal && modalAsset && (
        <TradeModal
          asset={modalAsset}
          initialSide="buy"
          allowSell={tradeModal.allowSell}
          onClose={() => setTradeModal(null)}
        />
      )}
    </div>
  );
}
