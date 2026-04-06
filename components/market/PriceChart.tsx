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

/** Human-readable X (time) for the hovered bucket, matched to chart range granularity. */
function formatChartTooltipTime(ms: number, chartRange: TimeRange): string {
  const d = new Date(ms);
  if (chartRange === "1D") {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (chartRange === "1W") {
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (chartRange === "1M") {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  /* 3M, 1Y — daily-style buckets */
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CustomTooltip({
  active,
  payload,
  chartRange,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: PricePoint; value?: number }>;
  chartRange: TimeRange;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const price = row?.price ?? payload[0]?.value ?? 0;
  const when =
    row && typeof row.time === "number" ? formatChartTooltipTime(row.time, chartRange) : null;

  return (
    <div
      style={{
        background: colors.surfaceRaised,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "8px 12px",
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
      {when ? (
        <p
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: 600,
            margin: "5px 0 0 0",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {when}
        </p>
      ) : null}
    </div>
  );
}

/** Vertical crosshair + X readout at bottom of plot (Recharts injects `points`, `payload`). */
function HoverBandCursor(
  props: {
    points?: { x: number; y: number }[];
    payload?: { payload?: PricePoint }[];
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    chartRange: TimeRange;
  }
) {
  const { points, payload, stroke, strokeWidth, strokeDasharray, chartRange } = props;
  if (!points || points.length < 2) return null;
  const [{ x, y: yTop }, { y: yBottom }] = points;
  const row = payload?.[0]?.payload;
  const t = row?.time;
  const when = typeof t === "number" ? formatChartTooltipTime(t, chartRange) : "";
  const lineStroke =
    stroke && stroke !== "#ccc" && stroke !== "rgb(204, 204, 204)" ? stroke : colors.border;

  return (
    <g className="recharts-tooltip-cursor" style={{ pointerEvents: "none" }}>
      <line
        x1={x}
        y1={yTop}
        x2={x}
        y2={yBottom}
        stroke={lineStroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
      />
      {when ? (
        <text
          x={x}
          y={yBottom + 15}
          textAnchor="middle"
          fill={colors.textMuted}
          fontSize={10}
          fontWeight={600}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {when}
        </text>
      ) : null}
    </g>
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
            margin={{ top: 4, right: 4, left: 0, bottom: 22 }}
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
              content={({ active, payload }) => (
                <CustomTooltip active={active} payload={payload} chartRange={range} />
              )}
              cursor={
                <HoverBandCursor
                  chartRange={range}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              }
              wrapperStyle={{ outline: "none" }}
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
