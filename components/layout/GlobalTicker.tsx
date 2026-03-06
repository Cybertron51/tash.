"use client";

/**
 * GlobalTicker — Full-viewport-width marquee bar
 *
 * Displays live-simulated PSA card prices at the top of every page.
 * Runs its own independent price simulation via setInterval so the ticker
 * stays fresh regardless of the active page.
 */

import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { colors } from "@/lib/theme";
import { tickPrice, type AssetData } from "@/lib/market-data";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

// ─────────────────────────────────────────────────────────
// Sub-component: single ticker chip
// ─────────────────────────────────────────────────────────

interface TickerChipProps {
  item: AssetData;
}

function TickerChip({ item }: TickerChipProps) {
  const isUp = item.change > 0;
  const isDown = item.change < 0;
  const sign = isUp ? "+" : "";

  return (
    <div
      className="flex items-center gap-[6px] px-4 select-none cursor-pointer"
      title={`${item.name} · PSA ${item.grade} · ${item.set}`}
    >
      {/* Symbol */}
      <span
        className="text-[11px] font-semibold tracking-[0.06em] uppercase"
        style={{ color: colors.textMuted }}
      >
        {item.symbol}
      </span>

      {/* Price */}
      <span
        className="tabular-nums text-[12px] font-medium"
        style={{ color: colors.textPrimary }}
      >
        {formatCurrency(item.price)}
      </span>

      {/* Change badge */}
      <span
        className={cn(
          "flex items-center gap-[3px] tabular-nums text-[11px] font-semibold",
          "px-[6px] py-[2px] rounded-[6px] leading-none"
        )}
        style={{
          color: isUp
            ? colors.green
            : isDown
              ? colors.red
              : colors.textSecondary,
          backgroundColor: isUp
            ? colors.greenMuted
            : isDown
              ? colors.redMuted
              : "transparent",
        }}
      >
        {isUp ? (
          <TrendingUp size={10} strokeWidth={2.5} />
        ) : isDown ? (
          <TrendingDown size={10} strokeWidth={2.5} />
        ) : (
          <Minus size={10} strokeWidth={2.5} />
        )}
        {sign}
        {item.changePct.toFixed(2)}%
      </span>

      {/* Separator */}
      <span
        className="text-[10px]"
        style={{ color: colors.border }}
        aria-hidden="true"
      >
        ·
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────

interface GlobalTickerProps {
  items: AssetData[];
}

export function GlobalTicker({ items }: GlobalTickerProps) {
  const [liveItems, setLiveItems] = useState<AssetData[]>(items);

  // Subscribe to live price changes
  useEffect(() => {
    let isMounted = true;

    async function initRealtime() {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;

      const channel = supabase
        .channel("public:prices")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "prices" },
          (payload) => {
            if (!isMounted) return;
            const newPrice = payload.new.price;
            const newChange = payload.new.change_24h;
            const newPct = payload.new.change_pct_24h;
            const cardId = payload.new.card_id;

            setLiveItems((prev) =>
              prev.map((item) => {
                if (item.id === cardId) {
                  return {
                    ...item,
                    price: newPrice,
                    change: newChange,
                    changePct: newPct,
                  };
                }
                return item;
              })
            );
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    const cleanupPromise = initRealtime();

    return () => {
      isMounted = false;
      cleanupPromise.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, []);

  const isMobile = useIsMobile();
  const doubled = [...liveItems, ...liveItems];

  return (
    <div
      role="marquee"
      aria-label="Live card market prices"
      className="relative w-full overflow-hidden border-b"
      style={{
        height: isMobile ? "32px" : "40px",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        zIndex: 110,
      }}
    >
      {/* Left fade mask */}
      <div
        className="ticker-fade-left pointer-events-none absolute left-0 top-0 z-10 h-full w-12"
        aria-hidden="true"
      />

      {/* Scrolling track */}
      <div className="flex h-full items-center">
        <div className="ticker-track">
          {doubled.map((item, i) => (
            <TickerChip key={`${item.symbol}-${i}`} item={item} />
          ))}
        </div>
      </div>

      {/* Right fade mask */}
      <div
        className="ticker-fade-right pointer-events-none absolute right-0 top-0 z-10 h-full w-12"
        aria-hidden="true"
      />
    </div>
  );
}

export default GlobalTicker;
