"use client";

import { colors } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import type { OrderBook as OrderBookType, OrderBookRow } from "@/lib/market-data";

interface OrderBookProps {
  orderBook: OrderBookType;
}

function BookRow({
  row,
  side,
}: {
  row: OrderBookRow;
  side: "ask" | "bid";
}) {
  const barColor = side === "ask" ? colors.redMuted : colors.greenMuted;
  const priceColor = side === "ask" ? colors.red : colors.green;

  return (
    <div
      className="relative flex items-center justify-between px-3 tabular-nums"
      style={{ height: 22, fontSize: 11 }}
    >
      {/* Depth bar */}
      <div
        className="absolute right-0 top-0 h-full"
        style={{
          width: `${row.depth * 100}%`,
          background: barColor,
        }}
      />
      <span className="relative z-[1] font-medium" style={{ color: priceColor }}>
        {formatCurrency(row.price)}
      </span>
      <span className="relative z-[1]" style={{ color: colors.textSecondary }}>
        {row.size}
      </span>
      <span className="relative z-[1]" style={{ color: colors.textMuted }}>
        {row.total}
      </span>
    </div>
  );
}

export function OrderBook({ orderBook }: OrderBookProps) {
  return (
    <div>
      {/* Column headers */}
      <div
        className="flex justify-between px-3 pb-[6px] pt-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: colors.textMuted }}
      >
        <span>Price</span>
        <span>Qty</span>
        <span>Total</span>
      </div>

      {/* Asks — highest at top, lowest nearest spread. API returns lowest→highest so we reverse for display */}
      {[...orderBook.asks].reverse().map((ask, i) => (
        <BookRow key={`ask-${i}`} row={ask} side="ask" />
      ))}

      {/* Spread */}
      <div
        className="my-1 flex items-center justify-center gap-2 py-[5px] text-[10px]"
        style={{
          borderTop: `1px solid ${colors.borderSubtle}`,
          borderBottom: `1px solid ${colors.borderSubtle}`,
          color: colors.textMuted,
        }}
      >
        <span>Spread</span>
        <span className="tabular-nums font-semibold" style={{ color: colors.textSecondary }}>
          {formatCurrency(orderBook.spread)} ({(orderBook.spreadPct * 100).toFixed(2)}%)
        </span>
      </div>

      {/* Bids */}
      {orderBook.bids.map((bid, i) => (
        <BookRow key={`bid-${i}`} row={bid} side="bid" />
      ))}
    </div>
  );
}
