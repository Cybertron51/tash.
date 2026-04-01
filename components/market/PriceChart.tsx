"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { colors } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import type { PricePoint, TimeRange } from "@/lib/market-data";

const TIME_RANGES: TimeRange[] = ["1D", "1W", "1M", "3M", "1Y"];

interface PriceChartProps {
  data: PricePoint[];
  isUp: boolean;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const price = payload[0]?.value ?? 0;
  return (
    <div
      style={{
        background: colors.surfaceRaised,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "6px 10px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
      }}
    >
      <p
        style={{
          color: colors.textPrimary,
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          margin: 0,
        }}
      >
        {formatCurrency(price)}
      </p>
    </div>
  );
}

export function PriceChart({
  data,
  isUp,
  range,
  onRangeChange,
}: PriceChartProps) {
  const color = isUp ? colors.green : colors.red;
  const gradientId = `tash-gradient-${isUp ? "up" : "down"}`;

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices) * 0.997;
  const max = Math.max(...prices) * 1.003;

  return (
    <div>
      {/* Chart */}
      <div style={{ height: 220, width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            key={range}
            data={data}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="85%" stopColor={color} stopOpacity={0.02} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" hide />
            <YAxis domain={[min, max]} hide />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: colors.border,
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4, fill: color, stroke: colors.background, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Time range selector */}
      <div className="mt-2 flex items-center gap-1">
        {TIME_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            className="rounded-[6px] px-3 py-[5px] text-[11px] font-semibold transition-all duration-100"
            style={{
              background: r === range ? colors.surfaceRaised : "transparent",
              color: r === range ? colors.textPrimary : colors.textMuted,
              border:
                r === range
                  ? `1px solid ${colors.border}`
                  : "1px solid transparent",
            }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
