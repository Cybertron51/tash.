"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { CheckCircle, Lock, Loader2 } from "lucide-react";
import { colors } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { usePortfolio } from "@/lib/portfolio-context";
import { api } from "@/lib/api";
import type { AssetData, OrderBook as OrderBookData } from "@/lib/market-data";
import { listedSupplyFromOrderBook, tradableInventoryCount } from "@/lib/order-quantity-limits";

interface TradePanelProps {
  asset: AssetData;
  orderBook?: OrderBookData | null;
  onRequestSignIn?: () => void;
}

// FORCE REFRESH v2

type Stage = "form" | "review" | "submitting" | "confirmed" | "error";

interface OrderResult {
  status: "queued" | "settled";
  txHash?: string;
  makerAddress?: string;
  message?: string;
}

export function TradePanel({ asset, orderBook, onRequestSignIn }: TradePanelProps) {
  const { user, isAuthenticated, updateBalance } = useAuth();
  const { addHolding, refreshPortfolio, holdings } = usePortfolio();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState(asset.price);
  const [stage, setStage] = useState<Stage>("form");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [justTCGPrice, setJustTCGPrice] = useState<{ low: number | null; mid: number | null; high: number | null } | null>(null);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);

  // Reset to form when asset changes
  useEffect(() => {
    setLimitPrice(asset.price);
    setQuantity(1);
    setStage("form");
    setResult(null);
    setJustTCGPrice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.symbol]);

  // Fetch JustTCG price when selling
  useEffect(() => {
    if (side === "sell" && !justTCGPrice && !isFetchingPrice) {
      async function fetchPrice() {
        setIsFetchingPrice(true);
        try {
          const params = new URLSearchParams({
            name: asset.name,
            set: asset.set || "",
            category: asset.category || "pokemon"
          });
          const res = await fetch(`/api/justtcg?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            setJustTCGPrice(data.price);
          }
        } catch (err) {
          console.error("Failed to fetch JustTCG price", err);
        } finally {
          setIsFetchingPrice(false);
        }
      }
      fetchPrice();
    }
  }, [side, asset.name, asset.set, asset.category, justTCGPrice, isFetchingPrice]);

  const maxBuyQty = useMemo(() => listedSupplyFromOrderBook(orderBook), [orderBook]);
  const maxSellQty = useMemo(
    () => tradableInventoryCount(holdings, asset.symbol),
    [holdings, asset.symbol]
  );

  useEffect(() => {
    const cap = side === "buy" ? maxBuyQty : maxSellQty;
    if (cap < 1) return;
    setQuantity((q) => Math.min(q, cap));
  }, [side, maxBuyQty, maxSellQty]);

  const lowestAsk = orderBook?.asks.length ? orderBook.asks[0].price : null;
  const highestBid = orderBook?.bids.length ? orderBook.bids[0].price : null;

  const estPrice =
    orderType === "market"
      ? side === "buy"
        ? lowestAsk ?? asset.price
        : highestBid ?? asset.price
      : limitPrice;

  const total = estPrice * quantity;
  const isBuy = side === "buy";
  const accent = isBuy ? colors.green : colors.red;
  const accentMuted = isBuy ? colors.greenMuted : colors.redMuted;

  const canAfford = !isAuthenticated || (user?.cashBalance ?? 0) >= total;
  const canPlaceBySupply =
    isBuy ? maxBuyQty >= 1 && quantity <= maxBuyQty : maxSellQty >= 1 && quantity <= maxSellQty;
  const canReview = canAfford && canPlaceBySupply;

  // Fill likelihood
  let fillLikelihood = null;
  let likelihoodColor: string = colors.textMuted;
  let likelihoodText = "";
  let likelihoodPct = 0;

  if (orderBook) {
    const bestOpposingPrice = isBuy
      ? orderBook.asks.length > 0 ? orderBook.asks[0].price : null
      : orderBook.bids.length > 0 ? orderBook.bids[0].price : null;

    if (bestOpposingPrice) {
      if (isBuy) {
        if (estPrice >= bestOpposingPrice) fillLikelihood = "Immediate";
        else {
          const diffPct = (bestOpposingPrice - estPrice) / bestOpposingPrice;
          if (diffPct < 0.02) fillLikelihood = "High";
          else if (diffPct <= 0.05) fillLikelihood = "Medium";
          else fillLikelihood = "Low";
        }
      } else {
        if (estPrice <= bestOpposingPrice) fillLikelihood = "Immediate";
        else {
          const diffPct = (estPrice - bestOpposingPrice) / bestOpposingPrice;
          if (diffPct < 0.02) fillLikelihood = "High";
          else if (diffPct <= 0.05) fillLikelihood = "Medium";
          else fillLikelihood = "Low";
        }
      }
    } else {
      fillLikelihood = "Low"; // No opposing orders
    }

    if (fillLikelihood === "Immediate") {
      likelihoodColor = colors.green;
      likelihoodText = "Immediate Fill";
      likelihoodPct = 100;
    } else if (fillLikelihood === "High") {
      likelihoodColor = colors.green;
      likelihoodText = "High Likelihood";
      likelihoodPct = 85;
    } else if (fillLikelihood === "Medium") {
      likelihoodColor = colors.gold;
      likelihoodText = "Medium Likelihood";
      likelihoodPct = 50;
    } else {
      likelihoodColor = colors.red;
      likelihoodText = "Low Likelihood";
      likelihoodPct = 15;
    }
  }

  function handleReview() {
    if (!isAuthenticated) {
      onRequestSignIn?.();
      return;
    }
    if (isBuy && maxBuyQty < 1) return;
    if (!isBuy && maxSellQty < 1) return;
    setStage("review");
  }

  async function handleConfirm() {
    if (!user) return;
    setStage("submitting");
    setErrorMsg("");

    try {
      const res = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          symbol: asset.symbol,
          priceUsd: estPrice,
          isBuy,
          quantity,
          cardName: asset.name,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(JSON.stringify(data, null, 2));
      }

      // Update local USD balance optimistically for buys (funds get locked)
      if (isBuy) {
        updateBalance(-total);
      } else {
        // For sells, the asset gets locked and we could remove it from 'tradable' optimistic UI here,
        // but a page refresh or context update will handle it.
      }

      setResult(data);
      refreshPortfolio();
      setStage("confirmed");
      setTimeout(() => {
        setStage("form");
        setResult(null);
      }, 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  }

  // ── Error state ──────────────────────────────────────────
  if (stage === "error") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <p className="text-[12px] font-semibold" style={{ color: colors.red }}>
          Order Failed
        </p>
        <p className="text-[11px]" style={{ color: colors.textMuted }}>
          {errorMsg}
        </p>
        <button
          onClick={() => setStage("form")}
          className="w-full rounded-[10px] py-[9px] text-[12px] font-semibold"
          style={{ background: colors.surfaceRaised, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Confirmed state ──────────────────────────────────────
  if (stage === "confirmed" && result) {
    return (
      <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
        <CheckCircle size={36} strokeWidth={1.5} style={{ color: colors.green }} />
        <p className="text-[14px] font-bold" style={{ color: colors.textPrimary }}>
          Order Submitted
        </p>
        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
          Check your portfolio for order status
        </p>
        <p className="mt-1 text-[10px]" style={{ color: colors.textMuted }}>
          {result.message || "Your order has been routed to the limit order book."}
        </p>
      </div>
    );
  }

  // ── Submitting state ─────────────────────────────────────
  if (stage === "submitting") {
    return (
      <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
        <Loader2
          size={32}
          strokeWidth={1.5}
          className="animate-spin"
          style={{ color: colors.green }}
        />
        <p className="text-[13px] font-semibold" style={{ color: colors.textPrimary }}>
          Submitting Order…
        </p>
        <p className="text-[11px]" style={{ color: colors.textMuted }}>
          Signing &amp; broadcasting to order book
        </p>
      </div>
    );
  }

  // ── Review state ─────────────────────────────────────────
  if (stage === "review") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <p className="text-[12px] font-semibold" style={{ color: colors.textMuted }}>
          Review Order
        </p>

        <div
          className="overflow-hidden rounded-[10px] border"
          style={{ borderColor: colors.border }}
        >
          {[
            { label: "Action", value: isBuy ? "Buy" : "Sell", accent: true },
            { label: "Card", value: asset.name, accent: false },
            { label: "Quantity", value: `${quantity} cop.`, accent: false },
            { label: "Order", value: orderType === "market" ? "Market" : `Limit @ ${formatCurrency(limitPrice)}`, accent: false },
            { label: "Est. Price", value: formatCurrency(estPrice), accent: false },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              className="flex items-center justify-between px-3 py-[10px]"
              style={{
                borderBottom: i < arr.length - 1 ? `1px solid ${colors.borderSubtle}` : undefined,
                background: i % 2 === 0 ? "transparent" : colors.surfaceRaised + "44",
              }}
            >
              <span className="text-[11px]" style={{ color: colors.textMuted }}>{row.label}</span>
              <span
                className="text-[12px] font-semibold"
                style={{ color: row.accent ? accent : colors.textPrimary }}
              >
                {row.value}
              </span>
            </div>
          ))}

          {/* Total */}
          <div
            className="flex items-center justify-between px-3 py-3"
            style={{ background: accentMuted, borderTop: `1px solid ${accent}33` }}
          >
            <span className="text-[12px] font-bold" style={{ color: colors.textPrimary }}>
              Total
            </span>
            <span className="tabular-nums text-[16px] font-black" style={{ color: accent }}>
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        <button
          onClick={handleConfirm}
          className="w-full rounded-[10px] py-[11px] text-[13px] font-bold transition-all duration-150 active:scale-[0.98]"
          style={{ background: accent, color: colors.textInverse }}
        >
          Confirm {isBuy ? "Purchase" : "Sale"}
        </button>

        <button
          onClick={() => setStage("form")}
          className="w-full rounded-[10px] py-[9px] text-[12px] font-semibold transition-colors"
          style={{
            background: "transparent",
            color: colors.textMuted,
            border: `1px solid ${colors.border}`,
          }}
        >
          Back
        </button>
      </div>
    );
  }

  // ── Form state ───────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Available balance */}
      {isAuthenticated && user && user.stripeOnboardingComplete && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
            Available
          </span>
          <span className="tabular-nums text-[12px] font-semibold" style={{ color: colors.textSecondary }}>
            {formatCurrency(user.cashBalance)}
          </span>
        </div>
      )}

      {/* Buy / Sell toggle */}
      <div
        className="flex rounded-[8px] p-[3px]"
        style={{ background: colors.surfaceOverlay }}
      >
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className="flex-1 rounded-[6px] py-[7px] text-[12px] font-bold capitalize transition-all duration-150"
            style={{
              background:
                side === s
                  ? s === "buy" ? colors.greenMuted : colors.redMuted
                  : "transparent",
              color:
                side === s
                  ? s === "buy" ? colors.green : colors.red
                  : colors.textMuted,
              border:
                side === s
                  ? `1px solid ${s === "buy" ? colors.green + "44" : colors.red + "44"}`
                  : "1px solid transparent",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Order type */}
      <div>
        <label
          className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: colors.textMuted }}
        >
          Order Type
        </label>
        <select
          value={orderType}
          onChange={(e) => setOrderType(e.target.value as "market" | "limit")}
          className="w-full rounded-[8px] px-3 py-2 text-[12px] font-medium"
          style={{
            background: colors.surfaceRaised,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="market">Market</option>
          <option value="limit">Limit</option>
        </select>
      </div>

      {/* Limit price */}
      {orderType === "limit" && (
        <div>
          <label
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: colors.textMuted }}
          >
            Limit Price
          </label>
          <input
            type="number"
            value={limitPrice}
            onChange={(e) => setLimitPrice(parseFloat(e.target.value) || asset.price)}
            min={0}
            step={1}
            className="w-full rounded-[8px] px-3 py-2 text-[12px] tabular-nums font-medium"
            style={{
              background: colors.surfaceRaised,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              outline: "none",
            }}
          />
          {side === "sell" && (
            <div className="mt-2 text-[10px] flex items-center justify-between px-1">
              <span style={{ color: colors.textMuted }}>JustTCG Market Est:</span>
              <span style={{ color: colors.textSecondary, fontWeight: 600 }}>
                {isFetchingPrice ? (
                  "Loading..."
                ) : justTCGPrice?.mid ? (
                  formatCurrency(justTCGPrice.mid)
                ) : (
                  "N/A"
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Fill likelihood — shown for all order types */}
      {fillLikelihood && (
        <div className="rounded-[8px] px-3 py-2" style={{ background: colors.surfaceRaised, border: `1px solid ${colors.borderSubtle}` }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>Fill Likelihood</span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: likelihoodColor }}>{likelihoodText}</span>
          </div>
          <div className="w-full h-1.5 rounded-full" style={{ background: colors.border }}>
            <div className="h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${likelihoodPct}%`, background: likelihoodColor }} />
          </div>
        </div>
      )}

      {/* Quantity */}
      <div>
        <label
          className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: colors.textMuted }}
        >
          Quantity
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[18px] font-bold leading-none"
            style={{
              background: colors.surfaceRaised,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
            }}
          >
            −
          </button>
          <span
            className="flex-1 text-center tabular-nums text-[18px] font-bold"
            style={{ color: colors.textPrimary }}
          >
            {quantity}
          </span>
          <button
            type="button"
            disabled={
              side === "buy"
                ? maxBuyQty < 1 || quantity >= maxBuyQty
                : maxSellQty < 1 || quantity >= maxSellQty
            }
            onClick={() => {
              const cap = side === "buy" ? maxBuyQty : maxSellQty;
              if (cap < 1) return;
              setQuantity((q) => Math.min(q + 1, cap));
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[18px] font-bold leading-none disabled:opacity-40"
            style={{
              background: colors.surfaceRaised,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
            }}
          >
            +
          </button>
        </div>
        <p className="mt-1.5 px-0.5 text-[10px]" style={{ color: colors.textMuted }}>
          {side === "buy"
            ? maxBuyQty < 1
              ? "Nothing listed for sale."
              : `Listed for sale: ${maxBuyQty}`
            : maxSellQty < 1
              ? "No tradable copies in your vault."
              : `You can sell: ${maxSellQty}`}
        </p>
      </div>

      {/* Summary */}
      <div
        className="rounded-[8px] p-3"
        style={{ background: colors.surfaceRaised }}
      >
        <div className="flex justify-between text-[11px]" style={{ color: colors.textMuted }}>
          <span>Est. Price per card</span>
          <span className="tabular-nums font-medium" style={{ color: colors.textSecondary }}>
            {formatCurrency(estPrice)}
          </span>
        </div>
        <div
          className="mt-2 flex items-center justify-between pt-2"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <span className="text-[12px] font-semibold" style={{ color: colors.textPrimary }}>
            Total
          </span>
          <span className="tabular-nums text-[15px] font-bold" style={{ color: colors.textPrimary }}>
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      {/* CTA */}
      {!isAuthenticated ? (
        <button
          onClick={onRequestSignIn}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] py-[10px] text-[13px] font-bold transition-all duration-150 active:scale-[0.98]"
          style={{ background: colors.green, color: colors.textInverse }}
        >
          <Lock size={13} strokeWidth={2.5} />
          Sign In to Trade
        </button>
      ) : (
        <button
          onClick={handleReview}
          disabled={!canReview}
          className="w-full rounded-[10px] py-[10px] text-[13px] font-bold transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
          style={{ background: accent, color: colors.textInverse }}
        >
          {!canAfford
            ? "Insufficient Funds"
            : isBuy && maxBuyQty < 1
              ? "Nothing Listed"
              : !isBuy && maxSellQty < 1
                ? "Nothing to Sell"
                : `Review ${isBuy ? "Purchase" : "Sale"}`}
        </button>
      )}
    </div>
  );
}
