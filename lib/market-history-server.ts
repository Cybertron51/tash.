/**
 * Server-only: bucketed price charts from **trades only** (per symbol). Catalog `prices` is anchor / pre-window level.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anchorSeriesTerminalToCatalog,
  applyMarketChartDisplayShape,
  buildTradeBucketedSeries,
  clampPriceToAnchorBand,
  RANGE_CONFIGS,
  SPARKLINE,
  type MarketChartShapeRange,
  type TimeRange,
} from "@/lib/chart-series";

export interface HistoryRow {
  recorded_at: string;
  price: number;
}

export interface SevenDayChange {
  change_7d: number;
  change_pct_7d: number;
}

/**
 * Trade-bucketed 1W metrics (no simulated chart stylization). Trades clamp per **card** catalog anchor.
 * % = (last bucket, forced to catalog − first bucket) / first bucket so it matches the chart.
 */
export async function batchSevenDayChangeFromTrades(
  admin: SupabaseClient,
  cardRows: { id: string; symbol: string }[]
): Promise<Map<string, SevenDayChange>> {
  const out = new Map<string, SevenDayChange>();
  if (cardRows.length === 0) return out;

  const range: TimeRange = "1W";
  const { bars, intervalMs } = RANGE_CONFIGS[range];
  const nowMs = Date.now();
  const sinceMs = nowMs - bars * intervalMs - 120_000;
  const sinceIso = new Date(sinceMs).toISOString();

  const cardIds = [...new Set(cardRows.map((r) => r.id))];
  const { data: cards, error: cardsErr } = await admin.from("cards").select("id, symbol").in("id", cardIds);

  if (cardsErr || !cards?.length) {
    for (const id of cardIds) {
      out.set(id, { change_7d: 0, change_pct_7d: 0 });
    }
    return out;
  }

  const symbolSet = [...new Set(cards.map((c) => c.symbol as string))];
  const { data: prices } = await admin.from("prices").select("card_id, price").in("card_id", cardIds);

  const priceByCard = new Map<string, number>();
  for (const row of prices ?? []) {
    const cid = row.card_id as string;
    const p = Number(row.price);
    if (p > 0) priceByCard.set(cid, p);
  }

  const { data: tradesWindow } = await admin
    .from("trades")
    .select("symbol, price, executed_at")
    .in("symbol", symbolSet)
    .gte("executed_at", sinceIso)
    .order("executed_at", { ascending: true })
    .limit(20000);

  const priorTradeBySymbol = new Map<string, number | null>();
  const anchorBySymbol = new Map<string, number>();

  await Promise.all(
    symbolSet.map(async (sym) => {
      const { data: pt } = await admin
        .from("trades")
        .select("price")
        .eq("symbol", sym)
        .lt("executed_at", sinceIso)
        .order("executed_at", { ascending: false })
        .limit(1);
      priorTradeBySymbol.set(
        sym,
        pt?.[0] != null ? Number((pt[0] as { price: unknown }).price) : null
      );

      const cid = cards.find((c) => (c.symbol as string) === sym)?.id as string | undefined;
      let a = cid ? priceByCard.get(cid) : undefined;
      if (!(a && a > 0)) a = await anchorPriceForSymbol(admin, sym);
      anchorBySymbol.set(sym, a);
    })
  );

  const tradesBySymbol = new Map<string, { t: number; price: number }[]>();
  for (const r of tradesWindow ?? []) {
    const sym = r.symbol as string;
    const arr = tradesBySymbol.get(sym) ?? [];
    arr.push({
      t: new Date(String(r.executed_at)).getTime(),
      price: Number(r.price),
    });
    tradesBySymbol.set(sym, arr);
  }

  for (const id of cardIds) {
    const card = cards.find((c) => c.id === id);
    if (!card) {
      out.set(id, { change_7d: 0, change_pct_7d: 0 });
      continue;
    }
    const sym = card.symbol as string;
    const anchorPrice = priceByCard.get(id) ?? anchorBySymbol.get(sym) ?? 1;
    const rawPts = tradesBySymbol.get(sym) ?? [];
    const tradePts = rawPts.map((p) => ({
      t: p.t,
      price: clampPriceToAnchorBand(p.price, anchorPrice),
    }));
    const startPrice = clampPriceToAnchorBand(priorTradeBySymbol.get(sym) ?? anchorPrice, anchorPrice);

    let series = buildTradeBucketedSeries(tradePts, anchorPrice, startPrice, bars, intervalMs, nowMs);
    series = anchorSeriesTerminalToCatalog(series, anchorPrice);
    const first = series[0]?.price ?? anchorPrice;
    const last = series[series.length - 1]?.price ?? anchorPrice;
    const change_7d = last - first;
    const change_pct_7d = first > 0 ? (change_7d / first) * 100 : 0;
    out.set(id, { change_7d, change_pct_7d });
  }

  return out;
}

export async function anchorPriceForSymbol(admin: SupabaseClient, symbol: string): Promise<number> {
  const { data: row } = await admin
    .from("cards")
    .select("prices(price)")
    .eq("symbol", symbol)
    .limit(1)
    .maybeSingle();

  if (!row) return 1;
  const prices = row.prices as { price: number } | { price: number }[] | null;
  const p = Array.isArray(prices) ? prices[0]?.price : prices?.price;
  const n = Number(p);
  return n > 0 ? n : 1;
}

/** Trade-only history for a symbol; uses `cardId` only to read `prices` when provided (same symbol row). */
export async function buildSymbolTradeHistory(
  admin: SupabaseClient,
  symbol: string,
  range: TimeRange,
  options?: { sparkline?: boolean; cardId?: string | null }
): Promise<HistoryRow[]> {
  const { bars, intervalMs } = options?.sparkline ? SPARKLINE : RANGE_CONFIGS[range];
  const nowMs = Date.now();
  const sinceMs = nowMs - bars * intervalMs - 120_000;
  const sinceIso = new Date(sinceMs).toISOString();

  let anchorPrice = 1;
  if (options?.cardId) {
    const { data: priceRow } = await admin.from("prices").select("price").eq("card_id", options.cardId).maybeSingle();
    const n = Number(priceRow?.price);
    anchorPrice = n > 0 ? n : (await anchorPriceForSymbol(admin, symbol));
  } else {
    anchorPrice = await anchorPriceForSymbol(admin, symbol);
  }

  const { data: priorTrade } = await admin
    .from("trades")
    .select("price")
    .eq("symbol", symbol)
    .lt("executed_at", sinceIso)
    .order("executed_at", { ascending: false })
    .limit(1);

  const startPrice = clampPriceToAnchorBand(
    priorTrade?.[0] != null ? Number((priorTrade[0] as { price: unknown }).price) : anchorPrice,
    anchorPrice
  );

  const { data: tradeRows } = await admin
    .from("trades")
    .select("price, executed_at")
    .eq("symbol", symbol)
    .gte("executed_at", sinceIso)
    .order("executed_at", { ascending: true })
    .limit(8000);

  const tradePts = (tradeRows ?? []).map((r) => ({
    t: new Date(String(r.executed_at)).getTime(),
    price: clampPriceToAnchorBand(Number(r.price), anchorPrice),
  }));

  let series = buildTradeBucketedSeries(tradePts, anchorPrice, startPrice, bars, intervalMs, nowMs);
  series = anchorSeriesTerminalToCatalog(series, anchorPrice);
  const shapeRange: MarketChartShapeRange = options?.sparkline ? "sparkline" : range;
  series = applyMarketChartDisplayShape(series, anchorPrice, symbol, shapeRange);

  return series.map((p) => ({
    recorded_at: new Date(p.time).toISOString(),
    price: p.price,
  }));
}

export async function buildCardMarketHistory(
  admin: SupabaseClient,
  cardId: string,
  range: TimeRange,
  options?: { sparkline?: boolean }
): Promise<HistoryRow[]> {
  const { data: cardRow, error: cardErr } = await admin.from("cards").select("symbol").eq("id", cardId).single();

  if (cardErr || !cardRow?.symbol) {
    return [];
  }

  return buildSymbolTradeHistory(admin, cardRow.symbol as string, range, {
    ...options,
    cardId,
  });
}

/** Batch sparklines / histories: trades per symbol only. */
export async function buildBatchMarketHistory(
  admin: SupabaseClient,
  cardIds: string[],
  range: TimeRange,
  options?: { sparkline?: boolean }
): Promise<Record<string, HistoryRow[]>> {
  const out: Record<string, HistoryRow[]> = {};
  if (cardIds.length === 0) return out;

  const { bars, intervalMs } = options?.sparkline ? SPARKLINE : RANGE_CONFIGS[range];
  const nowMs = Date.now();
  const sinceMs = nowMs - bars * intervalMs - 120_000;
  const sinceIso = new Date(sinceMs).toISOString();

  const { data: cards, error: cardsErr } = await admin.from("cards").select("id, symbol").in("id", cardIds);

  if (cardsErr || !cards?.length) {
    for (const id of cardIds) out[id] = [];
    return out;
  }

  const symbolSet = [...new Set(cards.map((c) => c.symbol as string))];

  const { data: prices } = await admin.from("prices").select("card_id, price").in("card_id", cardIds);

  const priceByCard = new Map<string, number>();
  for (const row of prices ?? []) {
    const cid = row.card_id as string;
    const p = Number(row.price);
    if (p > 0) priceByCard.set(cid, p);
  }

  const { data: tradesWindow } = await admin
    .from("trades")
    .select("symbol, price, executed_at")
    .in("symbol", symbolSet)
    .gte("executed_at", sinceIso)
    .order("executed_at", { ascending: true })
    .limit(20000);

  const priorTradeBySymbol = new Map<string, number | null>();
  const anchorBySymbol = new Map<string, number>();

  await Promise.all(
    symbolSet.map(async (sym) => {
      const { data: pt } = await admin
        .from("trades")
        .select("price")
        .eq("symbol", sym)
        .lt("executed_at", sinceIso)
        .order("executed_at", { ascending: false })
        .limit(1);
      priorTradeBySymbol.set(
        sym,
        pt?.[0] != null ? Number((pt[0] as { price: unknown }).price) : null
      );

      const cid = cards.find((c) => (c.symbol as string) === sym)?.id as string | undefined;
      let a = cid ? priceByCard.get(cid) : undefined;
      if (!(a && a > 0)) a = await anchorPriceForSymbol(admin, sym);
      anchorBySymbol.set(sym, a);
    })
  );

  const tradesBySymbol = new Map<string, { t: number; price: number }[]>();
  for (const r of tradesWindow ?? []) {
    const sym = r.symbol as string;
    const arr = tradesBySymbol.get(sym) ?? [];
    arr.push({
      t: new Date(String(r.executed_at)).getTime(),
      price: Number(r.price),
    });
    tradesBySymbol.set(sym, arr);
  }

  for (const id of cardIds) {
    const card = cards.find((c) => c.id === id);
    if (!card) {
      out[id] = [];
      continue;
    }
    const sym = card.symbol as string;
    const anchorPrice = priceByCard.get(id) ?? anchorBySymbol.get(sym) ?? (await anchorPriceForSymbol(admin, sym));
    const rawPts = tradesBySymbol.get(sym) ?? [];
    const tradePts = rawPts.map((p) => ({
      t: p.t,
      price: clampPriceToAnchorBand(p.price, anchorPrice),
    }));
    const startPrice = clampPriceToAnchorBand(priorTradeBySymbol.get(sym) ?? anchorPrice, anchorPrice);

    let series = buildTradeBucketedSeries(tradePts, anchorPrice, startPrice, bars, intervalMs, nowMs);
    series = anchorSeriesTerminalToCatalog(series, anchorPrice);
    const shapeRange: MarketChartShapeRange = options?.sparkline ? "sparkline" : range;
    series = applyMarketChartDisplayShape(series, anchorPrice, sym, shapeRange);

    out[id] = series.map((p) => ({
      recorded_at: new Date(p.time).toISOString(),
      price: p.price,
    }));
  }

  return out;
}
