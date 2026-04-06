/**
 * Server-only: bucketed price charts from **trades** plus **`price_history`** (same card) when `cardId` is known.
 * Catalog `prices` is anchor / pre-window level. Trade points override history at the same timestamp.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anchorSeriesTerminalToCatalog,
  applyMarketChartDisplayShape,
  buildIntradayEventBasedSeries,
  buildTradeBucketedSeries,
  clampPriceToAnchorBand,
  downsampleChartPoints,
  INTRADAY_CHART_WINDOW_MS,
  RANGE_CONFIGS,
  regulateListSparklineNetMove,
  SPARKLINE,
  SPARKLINE_LIST_MAX_POINTS,
  type ChartPoint,
  type MarketChartShapeRange,
  type TimeRange,
} from "@/lib/chart-series";
import {
  fetchPeerMedianFromDb,
  fillZeroAnchorsFromBatchPeers,
  medianPositive,
  synthesizePeerPrice,
} from "@/lib/peer-price-fallback";

/** Trade prints win over catalog history when both exist at the same epoch ms. */
function mergeTradeAndHistoryPoints(
  tradePts: { t: number; price: number }[],
  historyPts: { t: number; price: number }[]
): { t: number; price: number }[] {
  const byT = new Map<number, number>();
  for (const p of historyPts) byT.set(p.t, p.price);
  for (const p of tradePts) byT.set(p.t, p.price);
  return [...byT.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, price]) => ({ t, price }));
}

function groupHistoryRowsByCard(
  rows: { card_id: string; price: unknown; recorded_at: string }[] | null
): Map<string, { t: number; price: number }[]> {
  const m = new Map<string, { t: number; price: number }[]>();
  for (const r of rows ?? []) {
    const cid = r.card_id as string;
    const arr = m.get(cid) ?? [];
    arr.push({ t: new Date(r.recorded_at).getTime(), price: Number(r.price) });
    m.set(cid, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.t - b.t);
  return m;
}

/** Latest price per card in a row set (caller filters `recorded_at` as needed). */
function latestPricePerCardFromHistoryRows(
  rows: { card_id: string; price: unknown; recorded_at: string }[] | null
): Map<string, number> {
  const best = new Map<string, { t: number; p: number }>();
  for (const r of rows ?? []) {
    const cid = r.card_id as string;
    const t = new Date(r.recorded_at).getTime();
    const prev = best.get(cid);
    if (!prev || t > prev.t) best.set(cid, { t, p: Number(r.price) });
  }
  const out = new Map<string, number>();
  for (const [cid, v] of best) out.set(cid, v.p);
  return out;
}

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

  const [{ data: histInWindow }, { data: histBeforeWindow }] = await Promise.all([
    admin
      .from("price_history")
      .select("card_id, price, recorded_at")
      .in("card_id", cardIds)
      .gte("recorded_at", sinceIso)
      .order("recorded_at", { ascending: true })
      .limit(100_000),
    admin
      .from("price_history")
      .select("card_id, price, recorded_at")
      .in("card_id", cardIds)
      .lt("recorded_at", sinceIso)
      .limit(100_000),
  ]);

  const historyInByCard = groupHistoryRowsByCard(histInWindow as { card_id: string; price: unknown; recorded_at: string }[] | null);
  const priorHistoryPriceByCard = latestPricePerCardFromHistoryRows(
    histBeforeWindow as { card_id: string; price: unknown; recorded_at: string }[] | null
  );

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
    const histPts = historyInByCard.get(id) ?? [];
    const mergedRaw = mergeTradeAndHistoryPoints(rawPts, histPts);
    const tradePts = mergedRaw.map((p) => ({
      t: p.t,
      price: clampPriceToAnchorBand(p.price, anchorPrice),
    }));
    const priorTrade = priorTradeBySymbol.get(sym);
    const priorHist = priorHistoryPriceByCard.get(id) ?? null;
    const startRef = priorTrade ?? priorHist ?? anchorPrice;
    const startPrice = clampPriceToAnchorBand(startRef, anchorPrice);

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

  if (!row) return synthesizePeerPrice(symbol, 25);
  const prices = row.prices as { price: number } | { price: number }[] | null;
  const p = Array.isArray(prices) ? prices[0]?.price : prices?.price;
  const n = Number(p);
  return n > 0 ? n : synthesizePeerPrice(symbol, 25);
}

/** Trade-only history for a symbol; uses `cardId` only to read `prices` when provided (same symbol row). */
export async function buildSymbolTradeHistory(
  admin: SupabaseClient,
  symbol: string,
  range: TimeRange,
  options?: { sparkline?: boolean; cardId?: string | null }
): Promise<HistoryRow[]> {
  const usingSparkline = !!options?.sparkline;
  const useIntradayEvents = range === "1D" && !usingSparkline;
  const { bars, intervalMs } = usingSparkline ? SPARKLINE : RANGE_CONFIGS[range];
  const nowMs = Date.now();
  const sinceMs = useIntradayEvents
    ? nowMs - INTRADAY_CHART_WINDOW_MS - 120_000
    : nowMs - bars * intervalMs - 120_000;
  const sinceIso = new Date(sinceMs).toISOString();

  let anchorPrice = synthesizePeerPrice(symbol, 25);
  if (options?.cardId) {
    const { data: priceRow } = await admin.from("prices").select("price").eq("card_id", options.cardId).maybeSingle();
    const n = Number(priceRow?.price);
    if (n > 0) {
      anchorPrice = n;
    } else {
      const { data: meta } = await admin
        .from("cards")
        .select("category, psa_grade")
        .eq("id", options.cardId)
        .maybeSingle();
      if (meta?.category != null && meta.psa_grade != null) {
        const med = await fetchPeerMedianFromDb(
          admin,
          String(meta.category),
          Number(meta.psa_grade),
          options.cardId
        );
        anchorPrice = med != null ? synthesizePeerPrice(options.cardId, med) : synthesizePeerPrice(options.cardId, 25);
      } else {
        anchorPrice = await anchorPriceForSymbol(admin, symbol);
      }
    }
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

  let priorHistPrice: number | null = null;
  if (options?.cardId) {
    const { data: priorH } = await admin
      .from("price_history")
      .select("price, recorded_at")
      .eq("card_id", options.cardId)
      .lt("recorded_at", sinceIso)
      .order("recorded_at", { ascending: false })
      .limit(1);
    const row = priorH?.[0] as { price: unknown } | undefined;
    if (row != null) priorHistPrice = Number(row.price);
  }

  const priorTradePx = priorTrade?.[0] != null ? Number((priorTrade[0] as { price: unknown }).price) : null;
  const startRef = priorTradePx ?? priorHistPrice ?? anchorPrice;
  const startPrice = clampPriceToAnchorBand(startRef, anchorPrice);

  const { data: tradeRows } = await admin
    .from("trades")
    .select("price, executed_at")
    .eq("symbol", symbol)
    .gte("executed_at", sinceIso)
    .order("executed_at", { ascending: true })
    .limit(8000);

  const tradePtsOnly = (tradeRows ?? []).map((r) => ({
    t: new Date(String(r.executed_at)).getTime(),
    price: clampPriceToAnchorBand(Number(r.price), anchorPrice),
  }));

  let historyPts: { t: number; price: number }[] = [];
  if (options?.cardId) {
    const { data: histRows } = await admin
      .from("price_history")
      .select("price, recorded_at")
      .eq("card_id", options.cardId)
      .gte("recorded_at", sinceIso)
      .order("recorded_at", { ascending: true })
      .limit(8000);
    historyPts = (histRows ?? []).map((r) => ({
      t: new Date(String((r as { recorded_at: string }).recorded_at)).getTime(),
      price: clampPriceToAnchorBand(Number((r as { price: unknown }).price), anchorPrice),
    }));
  }

  const tradePts = mergeTradeAndHistoryPoints(tradePtsOnly, historyPts).map((p) => ({
    t: p.t,
    price: clampPriceToAnchorBand(p.price, anchorPrice),
  }));

  let series: ChartPoint[];
  if (useIntradayEvents) {
    series = buildIntradayEventBasedSeries(tradePts, anchorPrice, startPrice, nowMs);
    series = anchorSeriesTerminalToCatalog(series, anchorPrice, nowMs);
  } else {
    series = buildTradeBucketedSeries(tradePts, anchorPrice, startPrice, bars, intervalMs, nowMs);
    series = anchorSeriesTerminalToCatalog(series, anchorPrice);
    const shapeRange: MarketChartShapeRange = usingSparkline ? "sparkline" : range;
    series = applyMarketChartDisplayShape(series, anchorPrice, symbol, shapeRange);
  }

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

  const sparklineUses1W = !!options?.sparkline;
  const buildRange: TimeRange = sparklineUses1W ? "1W" : range;
  const useIntradayEvents = buildRange === "1D" && !sparklineUses1W;
  const { bars, intervalMs } = RANGE_CONFIGS[buildRange];
  const nowMs = Date.now();
  const sinceMs = useIntradayEvents
    ? nowMs - INTRADAY_CHART_WINDOW_MS - 120_000
    : nowMs - bars * intervalMs - 120_000;
  const sinceIso = new Date(sinceMs).toISOString();

  const { data: cards, error: cardsErr } = await admin
    .from("cards")
    .select("id, symbol, category, psa_grade")
    .in("id", cardIds);

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

  const anchorFallbackByCard = fillZeroAnchorsFromBatchPeers(
    cards as { id: string; category: string; psa_grade: number }[],
    priceByCard
  );

  const categoryMedianPrice = new Map<string, number>();
  if (sparklineUses1W) {
    const anchorsByCat = new Map<string, number[]>();
    for (const c of cards) {
      const id = c.id as string;
      let ap = priceByCard.get(id) ?? 0;
      if (!(ap > 0)) ap = anchorFallbackByCard.get(id) ?? 0;
      if (ap > 0) {
        const k = String((c as { category?: string }).category ?? "other");
        const arr = anchorsByCat.get(k) ?? [];
        arr.push(ap);
        anchorsByCat.set(k, arr);
      }
    }
    for (const [k, arr] of anchorsByCat) {
      const m = medianPositive(arr);
      if (m != null) categoryMedianPrice.set(k, m);
    }
  }

  const { data: tradesWindow } = await admin
    .from("trades")
    .select("symbol, price, executed_at")
    .in("symbol", symbolSet)
    .gte("executed_at", sinceIso)
    .order("executed_at", { ascending: true })
    .limit(20000);

  const [{ data: histInWindowBatch }, { data: histBeforeWindowBatch }] = await Promise.all([
    admin
      .from("price_history")
      .select("card_id, price, recorded_at")
      .in("card_id", cardIds)
      .gte("recorded_at", sinceIso)
      .order("recorded_at", { ascending: true })
      .limit(100_000),
    admin
      .from("price_history")
      .select("card_id, price, recorded_at")
      .in("card_id", cardIds)
      .lt("recorded_at", sinceIso)
      .limit(100_000),
  ]);

  const historyInByCardBatch = groupHistoryRowsByCard(
    histInWindowBatch as { card_id: string; price: unknown; recorded_at: string }[] | null
  );
  const priorHistoryPriceByCardBatch = latestPricePerCardFromHistoryRows(
    histBeforeWindowBatch as { card_id: string; price: unknown; recorded_at: string }[] | null
  );

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
      if (!(a && a > 0)) {
        a = cid ? anchorFallbackByCard.get(cid) : undefined;
      }
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
    const dbPx = priceByCard.get(id) ?? 0;
    const anchorPrice =
      dbPx > 0
        ? dbPx
        : anchorFallbackByCard.get(id) ??
          anchorBySymbol.get(sym) ??
          (await anchorPriceForSymbol(admin, sym));
    const rawPts = tradesBySymbol.get(sym) ?? [];
    const histPts = historyInByCardBatch.get(id) ?? [];
    const mergedRaw = mergeTradeAndHistoryPoints(rawPts, histPts);
    const tradePts = mergedRaw.map((p) => ({
      t: p.t,
      price: clampPriceToAnchorBand(p.price, anchorPrice),
    }));
    const priorHistPx = priorHistoryPriceByCardBatch.get(id) ?? null;
    const startRef = priorTradeBySymbol.get(sym) ?? priorHistPx ?? anchorPrice;
    const startPrice = clampPriceToAnchorBand(startRef, anchorPrice);

    let series: ChartPoint[];
    if (useIntradayEvents) {
      series = buildIntradayEventBasedSeries(tradePts, anchorPrice, startPrice, nowMs);
      series = anchorSeriesTerminalToCatalog(series, anchorPrice, nowMs);
    } else {
      series = buildTradeBucketedSeries(tradePts, anchorPrice, startPrice, bars, intervalMs, nowMs);
      series = anchorSeriesTerminalToCatalog(series, anchorPrice);
    }
    /** Per-card seed: duplicate `symbol` values share trades/history shape unless id differs. */
    const listDisplaySeed = `${id}|${sym}`;
    if (sparklineUses1W) {
      const catMed = categoryMedianPrice.get(String(card.category ?? "other")) ?? null;
      series = regulateListSparklineNetMove(series, anchorPrice, listDisplaySeed, { categoryMedian: catMed });
    }
    if (!useIntradayEvents) {
      const shapeRange: MarketChartShapeRange = sparklineUses1W ? "1W" : range;
      series = ApplyMarketChartDisplayShapeForBatch(series, anchorPrice, listDisplaySeed, shapeRange, sparklineUses1W);
    }

    out[id] = series.map((p) => ({
      recorded_at: new Date(p.time).toISOString(),
      price: p.price,
    }));
  }

  return out;
}

/** List batch: seed must include card id so rows with the same trading symbol get distinct curves. */
function ApplyMarketChartDisplayShapeForBatch(
  series: ChartPoint[],
  anchorPrice: number,
  displaySeed: string,
  shapeRange: MarketChartShapeRange,
  sparklineUses1W: boolean
) {
  let s = applyMarketChartDisplayShape(series, anchorPrice, displaySeed, shapeRange);
  if (sparklineUses1W) {
    s = downsampleChartPoints(s, SPARKLINE_LIST_MAX_POINTS);
  }
  return s;
}
