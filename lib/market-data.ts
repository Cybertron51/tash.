/**
 * TASH — Extended Market Data
 *
 * Generates mock historical prices, order books, and live simulation data.
 * Replace generators with real WebSocket / REST API in production.
 */

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface AssetData {
  id: string;
  name: string;
  symbol: string;
  grade: number;
  price: number;
  change: number;
  changePct: number;
  set: string;
  volume24h: number;
  high24h: number;
  low24h: number;
  category: "pokemon" | "sports" | "mtg" | "other";
  hasLiquidity?: boolean; // True if there are active listings for this card
  population: number;
  imageUrl?: string;
}

import type { DBCard } from "./db/cards";
import { RANGE_CONFIGS, SPARKLINE_WEEK, type TimeRange } from "./chart-series";

export type { TimeRange } from "./chart-series";

/** Keep 7D change in sync when only `price` updates (e.g. realtime). Baseline = price at last full compute. */
export function recomputeAssetChangeForNewPrice(
  asset: Pick<AssetData, "price" | "change">,
  newPrice: number
): { change: number; changePct: number } {
  const baseline = asset.price - asset.change;
  const change = newPrice - baseline;
  const changePct = baseline > 0 ? (change / baseline) * 100 : 0;
  return { change, changePct };
}

export function mapDBCardToAssetData(c: DBCard): AssetData {
  const has7d = "change_7d" in c && "change_pct_7d" in c;
  return {
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    grade: c.psa_grade,
    price: c.price,
    change: has7d ? c.change_7d! : c.change_24h,
    changePct: has7d ? c.change_pct_7d! : c.change_pct_24h,
    set: c.set_name,
    volume24h: c.volume_24h,
    high24h: c.high_24h ?? c.price,
    low24h: c.low_24h ?? c.price,
    category: c.category,
    hasLiquidity: false, // Will be populated by the frontend
    population: c.population,
    imageUrl: c.image_url_hi || c.image_url || undefined,
  };
}

export interface PricePoint {
  time: number;
  price: number;
}

export interface OrderBookRow {
  price: number;
  size: number;    // number of copies
  total: number;   // cumulative total
  depth: number;   // 0–1 for depth bar width
}

export interface OrderBook {
  asks: OrderBookRow[]; // sorted descending (highest at top for display)
  bids: OrderBookRow[]; // sorted descending (highest first)
  spread: number;
  spreadPct: number;
}

// ─────────────────────────────────────────────────────────
// Seeded RNG — deterministic charts per symbol (portfolio fallbacks)
// ─────────────────────────────────────────────────────────

function symbolSeed(str: string): number {
  return str
    .split("")
    .reduce((acc, c) => (Math.imul(acc, 31) + c.charCodeAt(0)) | 0, 0x811c9dc5);
}

function makeRng(seed: number) {
  let s = (Math.abs(seed) | 1) >>> 0;
  return () => {
    s = ((Math.imul(s, 1664525) + 1013904223) | 0) >>> 0;
    return s / 0x100000000;
  };
}

// ─────────────────────────────────────────────────────────
// History generator — synthetic fallback when no API series
// ─────────────────────────────────────────────────────────

export function generateHistory(
  price: number,
  changePct: number,
  range: TimeRange,
  symbol: string
): PricePoint[] {
  // Fallback: flat line when trade-driven APIs are unavailable (e.g. offline).
  const now = Date.now();
  const { bars, intervalMs } = RANGE_CONFIGS[range];
  const points: PricePoint[] = [];

  for (let i = 0; i < bars; i++) {
    const time = now - (bars - 1 - i) * intervalMs;
    points.push({ time, price });
  }

  return points;
}

// ─────────────────────────────────────────────────────────
// Sparkline generator — ~7d / 20 points, slope from 7D % + light wiggle
// ─────────────────────────────────────────────────────────

function symbolPhase(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffff_ffff;
}

/** Matches server `regulateListSparklineNetMove` band (~15% base + jitter); last-resort UI clamp. */
export const SPARKLINE_LIST_MAX_ABS_DISPLAY_PCT = 22;

/**
 * % change over the drawn sparkline: (last price − first) / first so the label matches the polyline.
 * Falls back to clamped `fallbackPct` when the series is too short. When clamping outliers, the cap
 * is slightly varied by endpoints so two rows rarely show the same pinned number (e.g. both −22.00).
 */
export function spotAnchoredSparklineChangePct(
  points: PricePoint[] | undefined,
  spotPrice: number,
  fallbackPct: number,
  maxAbsPct: number = SPARKLINE_LIST_MAX_ABS_DISPLAY_PCT
): number {
  const pts = points ?? [];
  if (pts.length < 2) {
    return clampAbsPctWithVariation(fallbackPct, maxAbsPct, `fb|${fallbackPct}`);
  }
  const start = pts[0]!.price;
  const end = pts[pts.length - 1]!.price;
  if (!(start > 0) || !(end > 0)) {
    return clampAbsPctWithVariation(fallbackPct, maxAbsPct, `bad|${start}|${end}`);
  }
  const raw = ((end - start) / start) * 100;
  if (!Number.isFinite(raw)) {
    return clampAbsPctWithVariation(fallbackPct, maxAbsPct, "nan");
  }
  const seed = `${start}|${end}|${pts.length}`;
  return clampAbsPctWithVariation(raw, maxAbsPct, seed);
}

/** When pinned to the cap, nudge ±~14% of `maxAbs` so duplicate-symbol rows don’t match exactly. */
function clampAbsPctWithVariation(pct: number, maxAbs: number, seed: string): number {
  if (!Number.isFinite(pct)) return 0;
  const m = Math.abs(maxAbs);
  if (m <= 0) return pct;
  if (Math.abs(pct) <= m) return pct;
  const headroom = m * (0.86 + 0.14 * symbolPhase(`${seed}|cap`));
  return Math.sign(pct) * headroom;
}

export function spotAnchoredSparklineUp(
  points: PricePoint[] | undefined,
  spotPrice: number,
  fallbackChange: number
): boolean {
  const pts = points ?? [];
  if (pts.length < 2) return fallbackChange >= 0;
  return spotAnchoredSparklineChangePct(points, spotPrice, 0) >= 0;
}

export function generateSparkline(
  price: number,
  changePct: number,
  symbol: string
): PricePoint[] {
  const now = Date.now();
  const points: PricePoint[] = [];
  const { bars, intervalMs } = SPARKLINE_WEEK;

  const pctRaw = Number.isFinite(changePct) ? changePct : 0;
  const pct = clampAbsPctWithVariation(pctRaw, SPARKLINE_LIST_MAX_ABS_DISPLAY_PCT, symbol);
  const denom = 1 + pct / 100;
  const startPrice =
    denom !== 0 && Math.abs(denom) > 1e-9 ? price / denom : price;

  const phase = symbolPhase(symbol);
  /** No decorative wobble when ~flat — avoids “fake rally” at 0% vs label. */
  const allowWobble = Math.abs(pct) >= 0.05;

  for (let i = 0; i < bars; i++) {
    const time = now - (bars - 1 - i) * intervalMs;
    const t = bars <= 1 ? 1 : i / (bars - 1);
    const chord = startPrice + (price - startPrice) * t;
    const ends = i === 0 || i === bars - 1;
    const wobble =
      ends || !allowWobble
        ? 0
        : price * 0.0022 * Math.sin(t * Math.PI * 2 * 2.3 + phase * 12.9898);
    const p = Math.max(0.01, chord + wobble);
    points.push({ time, price: round2(p) });
  }

  points[bars - 1] = { time: points[bars - 1]!.time, price: round2(price) };
  points[0] = { time: points[0]!.time, price: round2(startPrice) };

  return points;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────
// Order book generator
// ─────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────
// Live price tick — small random walk
// ─────────────────────────────────────────────────────────

export function tickPrice(asset: AssetData): AssetData {
  return asset;
}


