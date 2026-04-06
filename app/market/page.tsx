"use client";
export const dynamic = "force-dynamic";

/**
 * TASH — Market Home
 *
 * Two views toggled by the user:
 *   Simple   — portfolio-first casual browse (default)
 *   Advanced — full 3-column trading terminal
 *
 * The toggle always lives in the same physical position:
 *   top of the right sidebar (above "Order Book") in advanced mode,
 *   and the equivalent top-right corner in simple mode.
 */

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TrendingUp, TrendingDown, Zap, LayoutGrid, BarChart2, Filter, Menu, X, ChevronDown, ChevronUp } from "lucide-react";
import { SignInModal } from "@/components/auth/SignInModal";
import { SimpleView } from "@/components/market/SimpleView";
import {
  generateHistory,
  generateSparkline,
  recomputeAssetChangeForNewPrice,
  spotAnchoredSparklineChangePct,
  spotAnchoredSparklineUp,
  tickPrice,
  type AssetData,
  type TimeRange,
  type OrderBookRow,
  type PricePoint,
  type OrderBook as OrderBookData
} from "@/lib/market-data";
import { DualSlider } from "@/components/ui/DualSlider";
import { SparklineChart } from "@/components/market/SparklineChart";
import { PriceChart } from "@/components/market/PriceChart";
import { OrderBook } from "@/components/market/OrderBook";
import { TradePanel } from "@/components/market/TradePanel";
import { usePortfolio } from "@/lib/portfolio-context";
import { colors, layout } from "@/lib/theme";
import { formatCurrency, cn } from "@/lib/utils";
import {
  filterAdvancedVisibleAssets,
  resolveAdvancedSelectedAsset,
  selectionFromUrlSymbol,
} from "@/lib/market-view-filters";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

type ViewMode = "simple" | "advanced";

// ─────────────────────────────────────────────────────────
// View toggle — same component used in both layouts
// ─────────────────────────────────────────────────────────

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div
      className="flex items-center rounded-[8px] p-[3px]"
      style={{ background: colors.surfaceOverlay }}
    >
      {(["simple", "advanced"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className="flex items-center gap-[5px] rounded-[6px] px-3 py-[5px] text-[11px] font-semibold transition-all duration-150"
          style={{
            background: mode === m ? colors.surface : "transparent",
            color: mode === m ? colors.textPrimary : colors.textMuted,
            boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
          }}
        >
          {m === "simple"
            ? <><LayoutGrid size={11} strokeWidth={2} /> Simple</>
            : <><BarChart2 size={11} strokeWidth={2} /> Advanced</>
          }
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────

function MarketPageContent() {
  const searchParams = useSearchParams();
  const [assets, setAssets] = useState<AssetData[]>([]);
  /** Fresh catalog for searchParams-only updates without refetch (avoids unmounting SimpleView / losing modal state). */
  const assetsCatalogRef = useRef<AssetData[]>([]);
  useEffect(() => {
    assetsCatalogRef.current = assets;
  }, [assets]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("1W");
  const [flashMap, setFlashMap] = useState<Record<string, "up" | "down">>({});
  const [showSignIn, setShowSignIn] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("simple");
  const [showNonTradable, setShowNonTradable] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "pokemon" | "sports" | "mtg">("all");
  const [dashboardTab, setDashboardTab] = useState<"image" | "chart">("image");
  const [activeMarketImageIndex, setActiveMarketImageIndex] = useState(0);
  const [portfolioOpen, setPortfolioOpen] = useState(true);
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [minVolume, setMinVolume] = useState<number>(0);

  const { minPrice, maxPrice } = useMemo(() => {
    if (assets.length === 0) return { minPrice: 0, maxPrice: 1000 };
    let min = Infinity;
    let max = -Infinity;
    for (const a of assets) {
      if (a.price < min) min = a.price;
      if (a.price > max) max = a.price;
    }
    return { minPrice: Math.floor(min), maxPrice: Math.ceil(max) };
  }, [assets]);

  const activePriceRange = priceRange || [minPrice, maxPrice];

  const { holdings } = usePortfolio();
  const isMobile = useIsMobile();
  const [hasMounted, setHasMounted] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Persist view preference and handle hydration
  useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem("tash-view-mode") as ViewMode | null;
    if (stored === "simple" || stored === "advanced") setViewMode(stored);
  }, []);

  function handleViewChange(m: ViewMode) {
    setViewMode(m);
    localStorage.setItem("tash-view-mode", m);
  }

  const visibleAssets = useMemo(
    () =>
      filterAdvancedVisibleAssets({
        assets,
        showNonTradable,
        categoryFilter,
        priceRange,
        minVolume,
      }),
    [assets, showNonTradable, categoryFilter, priceRange, minVolume]
  );

  /** Resolve from full catalog so portfolio picks still match detail when the card is filtered out of the visible list. */
  const selected = resolveAdvancedSelectedAsset({
    assets,
    selectedSymbol,
    visibleAssets,
  });

  /**
   * Vault imagery may only be merged when the holding is the same catalog row.
   * Matching on symbol alone can show another user’s slab (e.g. baseball) while the header still shows Pokémon.
   */
  /** Same catalog row only — never symbol/name (avoids wrong slab when symbols collide). */
  const vaultHoldingForSelected = useMemo(() => {
    if (!selected || holdings.length === 0) return undefined;
    return holdings.find((h) => h.cardId === selected.id);
  }, [selected, holdings]);

  useEffect(() => {
    setActiveMarketImageIndex(0);
  }, [selected?.id]);

  // ── Initial load from Supabase ─────────────────────────
  useEffect(() => {
    async function fetchAssets() {
      const urlSymbol = searchParams?.get("symbol") ?? null;
      const catalog = assetsCatalogRef.current;

      // Client-side ?symbol= changes must not toggle isLoading or remount the tree — otherwise
      // SimpleView loses openTrade state when ⌘K navigates here and again when SimpleView clears the param.
      if (catalog.length > 0) {
        if (urlSymbol) {
          const { selectedSymbol: sym, revealNonTradable } = selectionFromUrlSymbol(urlSymbol, catalog);
          setSelectedSymbol(sym);
          if (revealNonTradable) {
            setShowNonTradable(true);
          }
        }
        return;
      }

      setIsLoading(true);
      const { getMarketCards } = await import("@/lib/db/cards");
      const { getActiveListingCounts } = await import("@/lib/db/vault");
      const { mapDBCardToAssetData } = await import("@/lib/market-data");

      const [dbCards, activeCounts] = await Promise.all([
        getMarketCards(),
        getActiveListingCounts()
      ]);

      if (dbCards && dbCards.length > 0) {
        const newAssets = dbCards.map(c => {
          const asset = mapDBCardToAssetData(c);
          asset.hasLiquidity = (activeCounts[asset.symbol] || 0) > 0;
          return asset;
        });
        setAssets(newAssets);

        if (urlSymbol) {
          const { selectedSymbol: sym, revealNonTradable } = selectionFromUrlSymbol(urlSymbol, newAssets);
          setSelectedSymbol(sym);
          if (revealNonTradable) {
            setShowNonTradable(true);
          }
        } else {
          const initialVisible = newAssets.filter(a => a.hasLiquidity);
          const fallback = initialVisible[0]?.symbol || newAssets[0]?.symbol || "";
          setSelectedSymbol(prev => prev || fallback);
        }
      }
      setIsLoading(false);
    }
    fetchAssets();
  }, [searchParams]);

  // When selected symbol changes on mobile, auto-close sidebar
  useEffect(() => {
    if (isMobile) {
      setShowSidebar(false);
    }
  }, [selectedSymbol, isMobile]);

  // ── Live price ticks via Realtime ───────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function initRealtime() {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;

      const channel = supabase
        .channel("public:prices:market")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "prices" },
          (payload) => {
            if (!isMounted) return;
            const newPrice = payload.new.price;
            const cardId = payload.new.card_id;

            setAssets((prev) => {
              const next = [...prev];
              const idx = next.findIndex(a => a.id === cardId);
              if (idx === -1) return prev;

              const oldAsset = next[idx];
              if (oldAsset.price !== newPrice) {
                // Trigger flash animation
                const flashDir = newPrice > oldAsset.price ? "up" : "down";
                setFlashMap((fm) => ({ ...fm, [oldAsset.id]: flashDir }));
                setTimeout(() => {
                  if (isMounted) {
                    setFlashMap((fm) => {
                      const newFm = { ...fm };
                      delete newFm[oldAsset.id];
                      return newFm;
                    });
                  }
                }, 500);
              }

              const { change, changePct } = recomputeAssetChangeForNewPrice(oldAsset, newPrice);

              next[idx] = {
                ...oldAsset,
                price: newPrice,
                change,
                changePct,
              };

              return next;
            });
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

  // ── Chart data (scoped to card + range so header % matches the active pill) ──
  const [chartSeries, setChartSeries] = useState<{
    cardId: string;
    range: TimeRange;
    points: PricePoint[];
  } | null>(null);

  useEffect(() => {
    if (!selected) {
      setChartSeries(null);
      return;
    }

    let isMounted = true;

    async function fetchHistory() {
      const { getPriceHistory } = await import("@/lib/db/cards");
      const history = await getPriceHistory(selected!.id, range);

      if (!isMounted) return;

      const formatted = history.map(point => ({
        time: new Date(point.recorded_at).getTime(),
        price: point.price
      }));

      const points =
        formatted.length === 0
          ? [{ time: Date.now(), price: selected!.price }]
          : formatted;

      setChartSeries({
        cardId: selected!.id,
        range,
        points,
      });
    }

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [selected?.id, range]);

  /** Points for PriceChart — empty while a new range is loading so we don't show the wrong window. */
  const chartPointsForUi = useMemo(() => {
    if (!selected || !chartSeries || chartSeries.cardId !== selected.id || chartSeries.range !== range) {
      return [] as PricePoint[];
    }
    return chartSeries.points;
  }, [selected, chartSeries, range]);

  const priceChartDisplayPoints = useMemo(() => {
    if (chartPointsForUi.length > 0) return chartPointsForUi;
    if (selected) return [{ time: Date.now(), price: selected.price }];
    return [] as PricePoint[];
  }, [chartPointsForUi, selected]);

  /** Upper-right change: start of loaded series → live spot, label matches range pill (catalog fallback when series missing). */
  const rangeWindowMetrics = useMemo(() => {
    if (!selected) {
      return { change: 0, changePct: 0, up: true, label: "1W" as const, pending: false as const };
    }
    const rangeLoadPending =
      !!selected &&
      (!chartSeries ||
        chartSeries.cardId !== selected.id ||
        chartSeries.range !== range);

    if (rangeLoadPending) {
      return { change: 0, changePct: 0, up: true, label: range, pending: true as const };
    }

    const synced =
      chartSeries &&
      chartSeries.cardId === selected.id &&
      chartSeries.range === range;
    const pts = synced ? chartSeries.points : null;
    if (pts && pts.length >= 2) {
      const start = pts[0]!.price;
      const end = selected.price;
      const change = end - start;
      const changePct = start > 0 ? (change / start) * 100 : 0;
      return { change, changePct, up: change >= 0, label: range, pending: false as const };
    }
    if (pts && pts.length === 1) {
      return { change: 0, changePct: 0, up: true, label: range, pending: false as const };
    }
    return {
      change: selected.change,
      changePct: selected.changePct,
      up: selected.change >= 0,
      label: "7D" as const,
      pending: false as const,
    };
  }, [selected, chartSeries, range]);

  const chartIsUp = rangeWindowMetrics.pending
    ? (selected?.change ?? 0) >= 0
    : rangeWindowMetrics.up;

  // ── Sparklines from trade + history batch (fallback: flat synthetic) ──
  const [sparklines, setSparklines] = useState<Record<string, PricePoint[]>>({});
  const assetIdsKey = useMemo(() => [...assets.map((a) => a.id)].sort().join(","), [assets]);
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  useEffect(() => {
    if (!assetIdsKey) {
      setSparklines({});
      return;
    }
    const snap = assetsRef.current;
    if (snap.length === 0) {
      setSparklines({});
      return;
    }
    let alive = true;

    (async () => {
      try {
        const { apiGet } = await import("@/lib/api");
        const chunkSize = 50;
        const batch: Record<string, { recorded_at: string; price: number }[]> = {};
        for (let i = 0; i < snap.length; i += chunkSize) {
          const slice = snap.slice(i, i + chunkSize);
          const ids = slice.map((a) => a.id).join(",");
          const part = await apiGet<Record<string, { recorded_at: string; price: number }[]>>(
            `/api/market/history/batch?cardIds=${encodeURIComponent(ids)}&sparkline=1`
          );
          Object.assign(batch, part);
        }
        if (!alive) return;
        const next: Record<string, PricePoint[]> = {};
        for (const a of snap) {
          const rows = batch[a.id];
          const pts =
            rows && rows.length >= 2
              ? rows.map((r) => ({
                  time: new Date(r.recorded_at).getTime(),
                  price: r.price,
                }))
              : null;
          /** Card id, not symbol — avoids collisions when two listings share a ticker. */
          next[a.id] =
            pts && pts.length >= 2
              ? pts
              : generateSparkline(a.price, a.changePct, `${a.symbol}|${a.id}`);
        }
        setSparklines(next);
      } catch {
        if (!alive) return;
        setSparklines(
          Object.fromEntries(
            snap.map((a) => [a.id, generateSparkline(a.price, a.changePct, `${a.symbol}|${a.id}`)])
          )
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [assetIdsKey]);

  // ── Order book ─────────────────────────────────────────
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);

  useEffect(() => {
    if (!selected) {
      setOrderBook(null);
      return;
    }
    let isActive = true;

    async function loadBook() {
      const { fetchOrderBook } = await import("@/lib/db/orders");
      const book = await fetchOrderBook(selected!.symbol);
      if (isActive) {
        setOrderBook(book);
      }
    }

    loadBook();
    return () => { isActive = false; };
  }, [selected?.symbol, holdings]);

  const chromeOffset = layout.chromeHeight;

  if (!hasMounted) {
    return (
      <div className="flex flex-col items-center justify-center p-8" style={{ minHeight: `calc(100dvh - ${chromeOffset})` }}>
        <p style={{ color: colors.textMuted, fontSize: 13, fontWeight: 600 }}>
          Loading market view...
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // Simple view
  // ─────────────────────────────────────────────────────────

  if (isLoading || assets.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: `calc(100dvh - ${chromeOffset})`, background: colors.background }}
      >
        <p style={{ color: colors.textMuted, fontSize: 13, fontWeight: 600 }}>
          {isLoading ? "Loading market data..." : "No market listings available."}
        </p>
      </div>
    );
  }

  if (viewMode === "simple") {
    return (
      <div
        className="overflow-y-auto"
        style={{ minHeight: `calc(100dvh - ${chromeOffset})` }}
      >
        {/* Toggle — top-right, same position as in advanced view */}
        <div
          className="sticky top-0 z-[10] flex items-center justify-end border-b px-4 py-[9px]"
          style={{ background: colors.background, borderColor: colors.border }}
        >
          <ViewToggle mode={viewMode} onChange={handleViewChange} />
        </div>

        <SimpleView
          assets={assets}
          sparklines={sparklines}
          flashMap={flashMap}
          onRequestSignIn={() => setShowSignIn(true)}
          showNonTradable={showNonTradable}
          onToggleShowNonTradable={() => setShowNonTradable(!showNonTradable)}
          focusSymbol={searchParams.get("symbol")}
        />

        {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // Advanced view — 3-column terminal
  // ─────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col md:flex-row"
      style={{ height: `calc(100dvh - ${chromeOffset})`, overflow: "hidden" }}
    >
      {/* ── Mobile Backdrop ──────────────────────────────── */}
      {isMobile && showSidebar && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* ── LEFT: Asset list (Sidebar) ─────────────────────── */}
      <aside
        className={cn(
          "flex flex-col border-r transition-transform duration-300 z-[100] overflow-hidden",
          isMobile ? "fixed left-0 bottom-0" : "relative",
          isMobile && !showSidebar ? "-translate-x-full" : "translate-x-0"
        )}
        style={{
          width: 280,
          minWidth: 280,
          borderColor: colors.border,
          background: colors.background,
          top: isMobile ? chromeOffset : 0,
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between border-t border-b px-4 py-3"
          style={{ background: colors.background, borderColor: colors.border }}
        >
          <div className="flex items-center gap-[6px]">
            <Zap size={12} strokeWidth={2.5} style={{ color: colors.green }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.green }}>
              Live Market
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-[6px] cursor-pointer"
              title={showNonTradable ? "Hide non-tradable" : "Show non-tradable"}
            >
              <input
                type="checkbox"
                checked={showNonTradable}
                onChange={() => setShowNonTradable(!showNonTradable)}
                className="w-3.5 h-3.5 rounded-[4px] border-none bg-[#111111] accent-[#22c55e] cursor-pointer"
                style={{ border: `1px solid ${colors.borderSubtle}` }}
              />
              <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline" style={{ color: colors.textMuted }}>
                Show not for sale
              </span>
            </label>
            {isMobile && (
              <button onClick={() => setShowSidebar(false)} className="p-1 -mr-2">
                <X size={18} style={{ color: colors.textMuted }} />
              </button>
            )}
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-col gap-2 border-b px-4 py-3" style={{ borderColor: colors.borderSubtle }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
            className="w-full rounded-[8px] px-3 py-[7px] text-[11px] font-bold uppercase tracking-widest outline-none cursor-pointer"
            style={{
              background: colors.surface,
              color: categoryFilter === "all" ? colors.textMuted : colors.green,
              border: `1px solid ${categoryFilter === "all" ? colors.border : colors.green + "40"}`,
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235A5A5A' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
              paddingRight: 28,
            }}
          >
            <option value="all">All Categories</option>
            <option value="pokemon">Pokémon</option>
            <option value="sports">Sports</option>
            <option value="mtg">MTG</option>
          </select>

          {/* Numeric Filters */}
          <div className="flex flex-col gap-3 pt-2 pb-1">
            <div className="flex bg-[#161616] rounded-[8px] px-3 pt-0 pb-[3px] border items-center w-full" style={{ borderColor: colors.border }}>
              <DualSlider
                min={minPrice}
                max={maxPrice}
                value={activePriceRange}
                onChange={setPriceRange}
                formatLabel={(v) => formatCurrency(v, { compact: true })}
              />
            </div>

            <div className="flex bg-[#161616] rounded-[8px] px-3 py-2 border items-center justify-between" style={{ borderColor: colors.border }}>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Min Vol</span>
              <input
                type="number"
                min={0}
                value={minVolume || ""}
                onChange={(e) => setMinVolume(Number(e.target.value))}
                placeholder="0"
                className="w-16 bg-transparent text-[12px] font-bold outline-none text-right tabular-nums"
                style={{ color: colors.textPrimary }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── My Portfolio (collapsible) ── */}
          {holdings.length > 0 && (
            <div
              className="mx-3 mt-3 mb-1 shrink-0 overflow-hidden rounded-[12px] border"
              style={{
                borderColor: colors.border,
                background: colors.surface,
                boxShadow: `inset 0 1px 0 0 ${colors.green}18`,
              }}
            >
              <button
                onClick={() => setPortfolioOpen((o) => !o)}
                className="flex w-full items-center justify-between px-3 py-[9px] cursor-pointer"
                style={{
                  background: colors.surfaceRaised,
                  border: "none",
                  borderBottom: `1px solid ${colors.borderSubtle}`,
                }}
              >
                <div className="flex items-center gap-[6px]">
                  <BarChart2 size={11} strokeWidth={2.5} style={{ color: colors.green }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: colors.green }}>
                    My Portfolio ({holdings.length})
                  </span>
                </div>
                {portfolioOpen
                  ? <ChevronUp size={12} style={{ color: colors.textMuted }} />
                  : <ChevronDown size={12} style={{ color: colors.textMuted }} />
                }
              </button>
              {portfolioOpen && holdings.map((h) => {
                const asset =
                  (h.cardId ? assets.find((a) => a.id === h.cardId) : undefined) ??
                  assets.find((a) => a.symbol === h.symbol);
                if (!asset) return null;
                const line = sparklines[asset.id] ?? [];
                const rowPct = spotAnchoredSparklineChangePct(line, asset.price, asset.changePct);
                const assetUp = spotAnchoredSparklineUp(line, asset.price, asset.change);
                const isSel = h.symbol === selectedSymbol;
                const flash = flashMap[asset.id];
                const gain = asset.price - h.acquisitionPrice;
                const gainPct = h.acquisitionPrice > 0 ? (gain / h.acquisitionPrice) * 100 : 0;
                const isG = gain >= 0;
                return (
                  <button
                    key={h.id}
                    onClick={() => setSelectedSymbol(h.symbol)}
                    className="w-full border-t text-left transition-colors duration-100 hover:bg-[#0f0f0f]"
                    style={{
                      borderColor: colors.borderSubtle,
                      background: isSel ? colors.surface : "transparent",
                      borderLeft: `2px solid ${isSel ? colors.green : "transparent"}`,
                      paddingLeft: isSel ? 10 : 12,
                      paddingRight: 12,
                      paddingTop: 10,
                      paddingBottom: 10,
                    }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold leading-snug" style={{ color: colors.textPrimary }}>
                          {h.name}
                        </p>
                        <div className="mt-[2px] flex items-center gap-[6px]">
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: colors.textMuted }}>
                            PSA {h.grade}
                          </span>
                        </div>
                        <p className="mt-[2px] text-[9px] font-semibold tabular-nums" style={{ color: colors.textMuted }}>
                          {isG ? "+" : ""}{gainPct.toFixed(1)}% vs cost
                        </p>
                      </div>
                      <SparklineChart data={sparklines[asset.id] ?? []} isUp={assetUp} width={56} height={26} />
                    </div>
                    <div className="mt-[6px] flex items-center justify-between">
                      <span
                        className="tabular-nums text-[13px] font-bold"
                        style={{
                          color: flash ? (flash === "up" ? colors.green : colors.red) : colors.textPrimary,
                          transition: "color 0.35s ease",
                        }}
                      >
                        {formatCurrency(asset.price)}
                      </span>
                      <span className="tabular-nums text-[11px] font-semibold" style={{ color: assetUp ? colors.green : colors.red }}>
                        {assetUp ? "+" : ""}{rowPct.toFixed(2)}% 7D
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {holdings.length > 0 && (
            <div
              className="flex shrink-0 items-center gap-3 px-4 py-3"
              style={{ background: colors.background }}
              aria-hidden
            >
              <div className="h-px min-w-[12px] flex-1" style={{ background: colors.border }} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap"
                style={{ color: colors.textMuted }}
              >
                Market
              </span>
              <div className="h-px min-w-[12px] flex-1" style={{ background: colors.border }} />
            </div>
          )}

          {visibleAssets.map((asset) => {
            const line = sparklines[asset.id] ?? [];
            const rowPct = spotAnchoredSparklineChangePct(line, asset.price, asset.changePct);
            const assetUp = spotAnchoredSparklineUp(line, asset.price, asset.change);
            const isSel = asset.symbol === selectedSymbol;
            const flash = flashMap[asset.id];

            return (
              <button
                key={asset.id}
                onClick={() => setSelectedSymbol(asset.symbol)}
                className="w-full border-b text-left transition-colors duration-100 hover:bg-[#0f0f0f]"
                style={{
                  borderColor: colors.borderSubtle,
                  background: isSel ? colors.surface : "transparent",
                  borderLeft: `2px solid ${isSel ? colors.green : "transparent"}`,
                  paddingLeft: isSel ? 10 : 12,
                  paddingRight: 12,
                  paddingTop: 10,
                  paddingBottom: 10,
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold leading-snug" style={{ color: colors.textPrimary }}>
                      {asset.name}
                    </p>
                    <div className="mt-[2px] flex items-center gap-[6px]">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: colors.textMuted }}>
                        PSA {asset.grade}
                      </span>
                      {!asset.hasLiquidity && (
                        <span
                          className="rounded-[4px] px-[4px] py-[1px] text-[8px] font-bold tracking-widest uppercase"
                          style={{ background: colors.surfaceRaised, color: colors.textMuted }}
                        >
                          Not Traded
                        </span>
                      )}
                    </div>
                  </div>
                  <SparklineChart data={sparklines[asset.id] ?? []} isUp={assetUp} width={56} height={26} />
                </div>
                <div className="mt-[6px] flex items-center justify-between">
                  <span
                    className="tabular-nums text-[13px] font-bold"
                    style={{
                      color: flash ? (flash === "up" ? colors.green : colors.red) : colors.textPrimary,
                      transition: "color 0.35s ease",
                    }}
                  >
                    {formatCurrency(asset.price)}
                  </span>
                  <span className="tabular-nums text-[11px] font-semibold" style={{ color: assetUp ? colors.green : colors.red }}>
                    {assetUp ? "+" : ""}{rowPct.toFixed(2)}% 7D
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── CENTER & RIGHT WRAPPER (Mobile scrollable, Desktop flex) ── */}
      <div className="flex flex-1 flex-col md:flex-row overflow-y-auto md:overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center" style={{ background: colors.background }}>
            <div className="text-center">
              <Filter size={32} style={{ color: colors.borderSubtle, margin: "0 auto 12px" }} />
              <p style={{ color: colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                No cards match the selected filters.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── CENTER: Chart + Stats + Grid ─────────────────── */}
            <main className="flex min-w-0 flex-1 flex-col md:overflow-y-auto" style={{ background: colors.background }}>
              {/* Header Row */}
              <div className="sticky top-0 z-[10] flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b px-4 sm:px-6 py-4"
                style={{ borderColor: colors.border, background: colors.background }}>
                <div className="flex items-start gap-3">
                  {isMobile && (
                    <button
                      onClick={() => setShowSidebar(!showSidebar)}
                      className="mt-[2px] p-1.5 rounded-md self-start"
                      style={{ background: colors.surfaceOverlay, border: `1px solid ${colors.borderSubtle}` }}
                    >
                      <Menu size={18} style={{ color: colors.textPrimary }} />
                    </button>
                  )}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-[18px] sm:text-[20px] font-bold leading-tight tracking-tight break-words" style={{ color: colors.textPrimary }}>
                          {selected.name}
                        </h1>
                        <div
                          className="rounded-[6px] px-2 py-[3px]"
                          style={{ background: colors.greenMuted, border: `1px solid ${colors.green}33` }}
                        >
                          <span className="text-[10px] whitespace-nowrap font-bold tracking-wide" style={{ color: colors.green }}>
                            PSA {selected.grade}
                          </span>
                        </div>
                      </div>
                      {isMobile && (
                        <div className="shrink-0">
                          <ViewToggle mode={viewMode} onChange={handleViewChange} />
                        </div>
                      )}
                    </div>
                    <p className="mt-[3px] text-[11px] uppercase tracking-wider" style={{ color: colors.textMuted }}>
                      {selected.set}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right mt-2 sm:mt-0 pl-[42px] sm:pl-0">
                  <p className="tabular-nums text-[24px] sm:text-[28px] font-bold leading-none tracking-tight" style={{ color: colors.textPrimary }}>
                    {formatCurrency(selected.price)}
                  </p>
                  <div className="mt-[5px] flex items-center sm:justify-end gap-[5px]">
                    {rangeWindowMetrics.pending ? (
                      <span className="text-[13px] font-semibold" style={{ color: colors.textMuted }}>
                        Loading {rangeWindowMetrics.label}…
                      </span>
                    ) : (
                      <>
                        {rangeWindowMetrics.up
                          ? <TrendingUp size={13} strokeWidth={2.5} style={{ color: colors.green }} />
                          : <TrendingDown size={13} strokeWidth={2.5} style={{ color: colors.red }} />
                        }
                        <span
                          className="tabular-nums text-[13px] font-semibold"
                          style={{ color: rangeWindowMetrics.up ? colors.green : colors.red }}
                        >
                          {rangeWindowMetrics.up ? "+" : ""}
                          {formatCurrency(rangeWindowMetrics.change)} ({rangeWindowMetrics.up ? "+" : ""}
                          {rangeWindowMetrics.changePct.toFixed(2)}% {rangeWindowMetrics.label})
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 pt-4 border-b" style={{ borderColor: colors.border }}>
                <div className="flex gap-6">
                  <button
                    onClick={() => setDashboardTab("image")}
                    className="pb-3 text-[13px] font-bold uppercase tracking-wider transition-colors"
                    style={{
                      color: dashboardTab === "image" ? colors.textPrimary : colors.textMuted,
                      borderBottom: `2px solid ${dashboardTab === "image" ? colors.green : "transparent"}`,
                    }}
                  >
                    Image
                  </button>
                  <button
                    onClick={() => setDashboardTab("chart")}
                    className="pb-3 text-[13px] font-bold uppercase tracking-wider transition-colors"
                    style={{
                      color: dashboardTab === "chart" ? colors.textPrimary : colors.textMuted,
                      borderBottom: `2px solid ${dashboardTab === "chart" ? colors.green : "transparent"}`,
                    }}
                  >
                    Price Chart
                  </button>
                </div>
              </div>

              <div className="px-6 py-5">
                {dashboardTab === "image" ? (
                  <div className="flex flex-col items-center justify-center rounded-[10px] gap-4" style={{ minHeight: 300 }}>
                    {(() => {
                      const h = vaultHoldingForSelected;
                      const hiResImage =
                        selected.imageUrl?.trim() || `/cards/${selected.symbol}.svg`;
                      const psaThumbnail =
                        h?.imageUrl?.trim() &&
                        selected.imageUrl?.trim() &&
                        h.imageUrl !== selected.imageUrl
                          ? h.imageUrl.trim()
                          : null;
                      const rawScan = h?.rawImageUrl?.trim() || null;
                      // Catalog drives hero; vault adds alternates only for this card_id
                      const images = [hiResImage, ...(psaThumbnail ? [psaThumbnail] : []), ...(rawScan ? [rawScan] : [])].filter(
                        (v, i, a) => a.indexOf(v) === i
                      );

                      return (
                        <div className="flex flex-col items-center gap-3">
                          <div
                            onClick={() => {
                              if (images.length > 1) {
                                setActiveMarketImageIndex((prev) => (prev + 1) % images.length);
                              }
                            }}
                            className="relative overflow-hidden shrink-0"
                            style={{
                              width: 220, height: 310, borderRadius: 12,
                              border: `1px solid ${colors.borderSubtle}`,
                              background: colors.surfaceOverlay,
                              cursor: images.length > 1 ? "pointer" : "default",
                            }}
                          >
                            <img
                              key={`${selected.id}-${images[activeMarketImageIndex] || images[0]}`}
                              src={images[activeMarketImageIndex] || images[0]}
                              alt={selected.name}
                              className="w-full h-full"
                              style={{ objectFit: 'contain', imageRendering: 'auto' }}
                              onError={(e) => {
                                e.currentTarget.src = "https://via.placeholder.com/220x310/1B1B1B/333333?text=Card+Image";
                              }}
                            />
                          </div>
                          {/* Carousel dots */}
                          {images.length > 1 && (
                            <div className="flex gap-1.5">
                              {images.map((_, i) => (
                                <div
                                  key={i}
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: i === activeMarketImageIndex ? colors.textPrimary : colors.borderSubtle,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <PriceChart data={priceChartDisplayPoints} isUp={chartIsUp} range={range} onRangeChange={setRange} />
                )}
              </div>

              <div className="mx-6 my-3 grid grid-cols-4 overflow-hidden rounded-[10px] border mb-8"
                style={{ borderColor: colors.border, background: colors.surface }}>
                {[
                  { label: "24H High", value: formatCurrency(selected.high24h) },
                  { label: "24H Low", value: formatCurrency(selected.low24h) },
                  { label: "Volume", value: `${selected.volume24h} cop.` },
                  { label: "Category", value: selected.category === "pokemon" ? "Pokémon" : selected.category === "sports" ? "Sports" : selected.category === "mtg" ? "Magic" : "Other" },
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    className={cn("flex flex-col gap-[4px] px-4 py-3", i < 3 && "border-r")}
                    style={{ borderColor: colors.borderSubtle }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                      {stat.label}
                    </span>
                    <span className="tabular-nums text-[13px] font-semibold" style={{ color: colors.textPrimary }}>
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>

            </main>

            {/* ── RIGHT: Toggle + Order book + Trade panel ─────── */}
            <aside
              className="flex flex-col shrink-0 md:border-l"
              style={{ width: isMobile ? "100%" : 320, minWidth: isMobile ? "100%" : 320, borderColor: colors.border, background: colors.background }}
            >
              {/* Toggle row */}
              <div
                className="flex items-center justify-end border-b px-4 py-[9px]"
                style={{
                  background: colors.background,
                  borderColor: colors.border,
                  display: isMobile ? 'none' : 'flex'
                }}
              >
                <ViewToggle mode={viewMode} onChange={handleViewChange} />
              </div>

              {/* Order Book label */}
              <div
                className="border-b px-4 py-[8px]"
                style={{ borderColor: colors.border }}
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: colors.textMuted }}>
                  Order Book
                </span>
              </div>

              <div className="flex md:flex-1 flex-col overflow-hidden border-b" style={{ borderColor: colors.border, minHeight: isMobile ? 300 : 'auto' }}>
                <div className="flex-1 overflow-y-auto">
                  {orderBook && <OrderBook orderBook={orderBook} />}
                </div>
              </div>

              <div className="overflow-y-auto">
                {selected && <TradePanel asset={selected} orderBook={orderBook} onRequestSignIn={() => setShowSignIn(true)} />}
              </div>
            </aside>
          </>
        )}
      </div>

      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>}>
      <MarketPageContent />
    </Suspense>
  );
}
