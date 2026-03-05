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

export function mapDBCardToAssetData(c: DBCard): AssetData {
  return {
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    grade: c.psa_grade,
    price: c.price,
    change: c.change_24h,
    changePct: c.change_pct_24h,
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

export type TimeRange = "1D" | "1W" | "1M" | "3M" | "1Y";

// ─────────────────────────────────────────────────────────
// Seeded RNG — deterministic charts per symbol
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
// History generator — OHLCV-inspired price series
// ─────────────────────────────────────────────────────────

const RANGE_CONFIGS: Record<TimeRange, { bars: number; intervalMs: number }> = {
  "1D": { bars: 48, intervalMs: 30 * 60 * 1000 },           // 30-min bars
  "1W": { bars: 84, intervalMs: 2 * 60 * 60 * 1000 },       // 2-hr bars
  "1M": { bars: 60, intervalMs: 12 * 60 * 60 * 1000 },      // 12-hr bars
  "3M": { bars: 90, intervalMs: 24 * 60 * 60 * 1000 },      // daily
  "1Y": { bars: 52, intervalMs: 7 * 24 * 60 * 60 * 1000 },  // weekly
};

export function generateHistory(
  price: number,
  changePct: number,
  range: TimeRange,
  symbol: string
): PricePoint[] {
  // Temporary behavior: just generate a flat line at the current price
  // until we wire up the real `price_history` database table.
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
// Sparkline generator — 20 hourly points
// ─────────────────────────────────────────────────────────

export function generateSparkline(
  price: number,
  changePct: number,
  symbol: string
): PricePoint[] {
  // Temporary behavior: just generate a flat line at the current price
  // to remove hallucinatory noise.
  const now = Date.now();
  const points: PricePoint[] = [];

  for (let i = 0; i < 20; i++) {
    const time = now - (19 - i) * 60 * 60 * 1000;
    points.push({ time, price });
  }

  return points;
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


