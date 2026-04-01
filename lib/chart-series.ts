/**
 * Shared chart time ranges and bucketing for price history (market + portfolio).
 */

export type TimeRange = "1D" | "1W" | "1M" | "3M" | "1Y";

export const RANGE_CONFIGS: Record<TimeRange, { bars: number; intervalMs: number }> = {
  "1D": { bars: 96, intervalMs: 15 * 60 * 1000 },
  "1W": { bars: 84, intervalMs: 2 * 60 * 60 * 1000 },
  "1M": { bars: 60, intervalMs: 12 * 60 * 60 * 1000 },
  "3M": { bars: 90, intervalMs: 24 * 60 * 60 * 1000 },
  "1Y": { bars: 52, intervalMs: 7 * 24 * 60 * 60 * 1000 },
};

/** Match prior mock sparkline density (~20 hourly samples). */
export const SPARKLINE = { bars: 20, intervalMs: 60 * 60 * 1000 };

export interface ChartPoint {
  time: number;
  price: number;
}

/** Hard clamp on trade-filled prices vs catalog anchor (prevents absurd % moves from bad prints). */
export const TRADE_DEVIATION_CLAMP = 0.22; // ±22% from anchor before stylization

export function clampPriceToAnchorBand(price: number, anchor: number): number {
  if (!(anchor > 0)) return price;
  const lo = anchor * (1 - TRADE_DEVIATION_CLAMP);
  const hi = anchor * (1 + TRADE_DEVIATION_CLAMP);
  return Math.max(lo, Math.min(hi, price));
}

const ONE_DAY_MS = 86_400_000;
const ONE_HOUR_MS = 3_600_000;

/** Bars at this resolution or finer get stepped intraday path */
export const INTRADAY_MAX_BAR_MS = 3 * ONE_HOUR_MS;

/** Max (max−min)/anchor for final displayed series */
const MAX_SPREAD_FRAC = 0.18;

/** Minimum visible spread by range so every card shows some movement */
const MIN_SPREAD_FRAC: Record<TimeRange, number> = {
  "1D": 0.014,
  "1W": 0.02,
  "1M": 0.024,
  "3M": 0.026,
  "1Y": 0.028,
};

function blendHorizonMs(range: TimeRange): number {
  if (range === "1M" || range === "3M" || range === "1Y") {
    return 30 * ONE_DAY_MS;
  }
  return 7 * ONE_DAY_MS;
}

function stringHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mix32(a: number, b: number): number {
  return (Math.imul(a ^ b, 2654435761) >>> 0) ^ (b * 1597334677);
}

/**
 * ~5–6 moves per calendar day: piecewise-linear through 7 knots (0 → … → 0),
 * five random steps then a closing segment back to 0.
 */
function steppedIntradayRatio(timeMs: number, seedHash: number): number {
  const dk = Math.floor(timeMs / ONE_DAY_MS);
  let s = mix32(seedHash, dk) >>> 0;
  const stepAmp = 0.0065;

  const knots: number[] = [0];
  let acc = 0;
  for (let i = 0; i < 5; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    acc += ((s / 0xffff_ffff) * 2 - 1) * stepAmp;
    knots.push(acc);
  }
  knots.push(0);

  const msIntoDay = ((timeMs % ONE_DAY_MS) + ONE_DAY_MS) % ONE_DAY_MS;
  const u = msIntoDay / ONE_DAY_MS;
  const fracs = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1.0];

  for (let i = 0; i < 6; i++) {
    if (u <= fracs[i + 1]!) {
      const t = (u - fracs[i]!) / (fracs[i + 1]! - fracs[i]!);
      return knots[i]! * (1 - t) + knots[i + 1]! * t;
    }
  }
  return 0;
}

function enforceSpreadBand(
  points: ChartPoint[],
  anchor: number,
  range: TimeRange
): ChartPoint[] {
  if (points.length === 0 || !(anchor > 0)) return points;

  const vals = points.map((p) => p.price);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const spread = hi - lo;
  const minS = anchor * MIN_SPREAD_FRAC[range];
  const maxS = anchor * MAX_SPREAD_FRAC;

  if (spread <= 0) {
    const half = minS / 2;
    return points.map((p, i) => {
      const wiggle = (i / Math.max(1, points.length - 1) - 0.5) * 2;
      return { time: p.time, price: anchor + half * wiggle };
    });
  }

  let center = (lo + hi) / 2;
  let newLo = lo;
  let newHi = hi;

  if (spread < minS) {
    const pad = (minS - spread) / 2;
    newLo = lo - pad;
    newHi = hi + pad;
  }

  let newSpread = newHi - newLo;
  if (newSpread > maxS) {
    const c = (newLo + newHi) / 2;
    newLo = c - maxS / 2;
    newHi = c + maxS / 2;
    newSpread = maxS;
  }

  return points.map((p) => ({
    time: p.time,
    price: newLo + ((p.price - lo) / (hi - lo)) * (newHi - newLo),
  }));
}

/**
 * Forward-fill **trade prints only** into fixed time buckets.
 * `startPrice` is the last trade before the window (or catalog anchor if none).
 */
export function buildTradeBucketedSeries(
  tradePts: { t: number; price: number }[],
  anchorPrice: number,
  startPrice: number,
  bars: number,
  intervalMs: number,
  nowMs: number
): ChartPoint[] {
  const firstBucketT = nowMs - (bars - 1) * intervalMs;
  const sorted = [...tradePts].sort((a, b) => a.t - b.t);
  const events: { t: number; price: number }[] = [];

  if (sorted.length === 0 || sorted[0]!.t > firstBucketT) {
    events.push({ t: firstBucketT - 1, price: startPrice });
  }

  for (const p of sorted) {
    if (events.length && events[events.length - 1]!.t === p.t) {
      events[events.length - 1] = { t: p.t, price: p.price };
      continue;
    }
    events.push({ t: p.t, price: p.price });
  }

  const loB = anchorPrice * (1 - TRADE_DEVIATION_CLAMP);
  const hiB = anchorPrice * (1 + TRADE_DEVIATION_CLAMP);

  const points: ChartPoint[] = [];
  let j = 0;
  let lastP = Math.max(loB, Math.min(hiB, anchorPrice));

  for (let i = 0; i < bars; i++) {
    const t = nowMs - (bars - 1 - i) * intervalMs;
    while (j < events.length && events[j]!.t <= t) {
      lastP = Math.max(loB, Math.min(hiB, events[j]!.price));
      j++;
    }
    if (j === 0 && events.length > 0 && events[0]!.t > t) {
      lastP = Math.max(loB, Math.min(hiB, startPrice));
    }
    points.push({ time: t, price: lastP });
  }

  return points;
}

/** Set the last bucket to catalog price so the chart ends at spot and matches 7D % endpoints. */
export function anchorSeriesTerminalToCatalog(points: ChartPoint[], anchorPrice: number): ChartPoint[] {
  if (points.length === 0) return points;
  const out = points.slice();
  const i = out.length - 1;
  out[i] = { time: out[i]!.time, price: anchorPrice };
  return out;
}

/** Used only for market chart display shape (sparklines use `sparkline`). */
export type MarketChartShapeRange = TimeRange | "sparkline";

/**
 * Display-only: make 1D vs 1W (etc.) visually distinct when trade forward-fill would
 * otherwise look identical. Pins first/last buckets so window endpoints stay aligned;
 * does not affect `batchSevenDayChangeFromTrades` (metrics use raw bucketed series).
 */
export function applyMarketChartDisplayShape(
  points: ChartPoint[],
  anchorPrice: number,
  seedKey: string,
  shapeRange: MarketChartShapeRange
): ChartPoint[] {
  if (points.length < 3 || !(anchorPrice > 0)) {
    return [...points];
  }

  const lo = anchorPrice * (1 - TRADE_DEVIATION_CLAMP);
  const hi = anchorPrice * (1 + TRADE_DEVIATION_CLAMP);

  const vals = points.map((p) => p.price);
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const rawSpread = (rawMax - rawMin) / anchorPrice;

  const cycles: Record<MarketChartShapeRange, number> = {
    /** Subtle: avoid busy intraday zig-zag; still distinct from 1W. */
    "1D": 0.95,
    "1W": 2.05,
    "1M": 1.32,
    "3M": 0.92,
    "1Y": 0.58,
    sparkline: 1.15,
  };

  const relAmp: Record<MarketChartShapeRange, number> = {
    "1D": 0.0022,
    "1W": 0.0095,
    "1M": 0.0105,
    "3M": 0.0115,
    "1Y": 0.0125,
    sparkline: 0.0026,
  };

  const c = cycles[shapeRange];
  const baseAmp = relAmp[shapeRange];
  const h = stringHash(`${seedKey}|${shapeRange}`);
  const phase1 = ((h % 1000) / 1000) * Math.PI * 2;
  const phase2 = (((h >>> 12) % 1000) / 1000) * Math.PI * 2;

  const hasMeaningfulSpread = rawSpread >= 0.012;
  const dampen = hasMeaningfulSpread ? 0.35 : 1;

  const n = points.length;
  const out = points.map((p, i) => {
    if (i === 0 || i === n - 1) {
      return { ...p };
    }
    const u = i / (n - 1);
    const s1 = Math.sin(u * Math.PI * 2 * c + phase1);
    const s2 = Math.sin(u * Math.PI * 2 * c * 1.31 + phase2);
    const bump = (s1 * 0.62 + s2 * 0.38) * baseAmp * dampen;
    const v = p.price * (1 + bump);
    return { time: p.time, price: Math.max(lo, Math.min(hi, v)) };
  });

  out[0] = { ...points[0]! };
  out[n - 1] = { ...points[n - 1]! };
  return out;
}

/**
 * Blend trade path with a slow deterministic offset around `anchorPrice`, stepped intraday
 * (few moves per day), hard caps vs anchor, then enforce min/max spread for the active range.
 */
export function applySevenDaySimulatedMovement(
  points: readonly ChartPoint[],
  anchorPrice: number,
  seedKey: string,
  nowMs: number = Date.now(),
  barIntervalMs?: number,
  range: TimeRange = "1W"
): ChartPoint[] {
  if (points.length === 0 || !(anchorPrice > 0)) {
    return [...points];
  }

  const cutoff = nowMs - blendHorizonMs(range);
  const inWindow = points.filter((p) => p.time >= cutoff);

  let mixSim = 0.4;
  let tradeMin = anchorPrice;
  let tradeMax = anchorPrice;
  if (inWindow.length >= 2) {
    const vals = inWindow.map((p) => p.price);
    tradeMin = Math.min(...vals);
    tradeMax = Math.max(...vals);
    const rangeRatio = (tradeMax - tradeMin) / anchorPrice;
    mixSim = 0.48 - Math.min(0.28, rangeRatio * 3.5);
    mixSim = Math.max(0.2, Math.min(0.48, mixSim));
  } else if (inWindow.length === 1) {
    tradeMin = tradeMax = inWindow[0]!.price;
    mixSim = 0.42;
  }

  const bandLo = anchorPrice * (1 - TRADE_DEVIATION_CLAMP);
  const bandHi = anchorPrice * (1 + TRADE_DEVIATION_CLAMP);
  const softLo = Math.min(bandLo, tradeMin * 0.998);
  const softHi = Math.max(bandHi, tradeMax * 1.002);

  const h = stringHash(seedKey);
  const phase = ((h % 1000) / 1000) * Math.PI * 2;
  const useIntraday =
    barIntervalMs != null && barIntervalMs > 0 && barIntervalMs <= INTRADAY_MAX_BAR_MS;

  const out: ChartPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (p.time < cutoff) {
      let pr = Math.max(bandLo, Math.min(bandHi, p.price));
      if (useIntraday) {
        pr *= 1 + steppedIntradayRatio(p.time, h) * 0.45;
        pr = Math.max(bandLo, Math.min(bandHi, pr));
      }
      out.push({ time: p.time, price: pr });
      continue;
    }

    const ageDays = (nowMs - p.time) / ONE_DAY_MS;
    const w = 0.05 * Math.sin(ageDays * 0.85 + phase);
    const r = Math.max(-0.055, Math.min(0.055, w));
    const simP = anchorPrice * (1 + r);
    const tradeP = Math.max(bandLo, Math.min(bandHi, p.price));

    let blended = tradeP * (1 - mixSim) + simP * mixSim;

    const prev = out[out.length - 1];
    if (prev && prev.time < cutoff) {
      blended = prev.price * 0.22 + blended * 0.78;
    }

    blended = Math.max(softLo, Math.min(softHi, blended));

    if (useIntraday) {
      blended *= 1 + steppedIntradayRatio(p.time, h);
      blended = Math.max(bandLo, Math.min(bandHi, blended));
    }

    out.push({ time: p.time, price: blended });
  }

  return enforceSpreadBand(out, anchorPrice, range);
}
