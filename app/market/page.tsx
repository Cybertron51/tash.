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

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TrendingUp, TrendingDown, Zap, LayoutGrid, BarChart2, Filter, Menu, X, ChevronDown, ChevronUp } from "lucide-react";
import { SignInModal } from "@/components/auth/SignInModal";
import { SimpleView } from "@/components/market/SimpleView";
import {
  generateHistory,
  generateSparkline,
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
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("1D");
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

  const visibleAssets = useMemo(() => {
    let result = showNonTradable ? assets : assets.filter(a => a.hasLiquidity);

    if (categoryFilter !== "all") {
      result = result.filter(a => a.category === categoryFilter);
    }

    if (priceRange) {
      result = result.filter(a => a.price >= priceRange[0] && a.price <= priceRange[1]);
    }
    if (minVolume > 0) {
      result = result.filter(a => a.volume24h >= minVolume);
    }

    result = [...result].sort((a, b) => b.volume24h - a.volume24h);

    return result;
  }, [assets, showNonTradable, categoryFilter, priceRange, minVolume]);

  const selected = visibleAssets.find((a) => a.symbol === selectedSymbol) ?? visibleAssets[0] ?? null;
  const isUp = selected ? selected.change >= 0 : false;

  // ── Initial load from Supabase ─────────────────────────
  useEffect(() => {
    async function fetchAssets() {
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

        const urlSymbol = searchParams?.get("symbol");
        if (urlSymbol) {
          const target = newAssets.find(a => a.symbol === urlSymbol);
          if (target) {
            setSelectedSymbol(urlSymbol);
            if (!target.hasLiquidity) {
              setShowNonTradable(true);
            }
          } else {
            // Default to first tradable or first overall
            const initialVisible = newAssets.filter(a => a.hasLiquidity);
            const fallback = initialVisible[0]?.symbol || newAssets[0]?.symbol || "";
            setSelectedSymbol(fallback);
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
            const newChange = payload.new.change_24h;
            const newPct = payload.new.change_pct_24h;
            const cardId = payload.new.card_id;

            setAssets((prev) => {
              const next = [...prev];
              const idx = next.findIndex(a => a.id === cardId);
              if (idx === -1) return prev;

              const oldAsset = next[idx];
              if (oldAsset.price !== newPrice) {
                // Trigger flash animation
                const flashDir = newPrice > oldAsset.price ? "up" : "down";
                setFlashMap((fm) => ({ ...fm, [oldAsset.symbol]: flashDir }));
                setTimeout(() => {
                  if (isMounted) {
                    setFlashMap((fm) => {
                      const newFm = { ...fm };
                      delete newFm[oldAsset.symbol];
                      return newFm;
                    });
                  }
                }, 500);
              }

              next[idx] = {
                ...oldAsset,
                price: newPrice,
                change: newChange,
                changePct: newPct,
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

  // ── Chart data ─────────────────────────────────────────
  const [chartData, setChartData] = useState<PricePoint[]>([]);

  useEffect(() => {
    if (!selected) return;

    let isMounted = true;
    const days = range === "1D" ? 1 : range === "1W" ? 7 : range === "1M" ? 30 : range === "3M" ? 90 : 365;

    async function fetchHistory() {
      const { getPriceHistory } = await import("@/lib/db/cards");
      const history = await getPriceHistory(selected!.id, days);

      if (!isMounted) return;

      const formatted = history.map(point => ({
        time: new Date(point.recorded_at).getTime(),
        price: point.price
      }));

      // In case we don't have enough history, fallback to at least the current price
      if (formatted.length === 0) {
        setChartData([{ time: Date.now(), price: selected!.price }]);
      } else {
        setChartData(formatted);
      }
    }

    fetchHistory();

    return () => { isMounted = false; };
  }, [selected?.id, range]);

  // ── Sparklines (generated once) ────────────────────────
  const sparklines = useMemo(
    () =>
      Object.fromEntries(
        assets.map((a) => [a.symbol, generateSparkline(a.price, a.changePct, a.symbol)])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets.length]
  );

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
                Show all
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
            <div className="border-b" style={{ borderColor: colors.border }}>
              <button
                onClick={() => setPortfolioOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-[8px] cursor-pointer"
                style={{ background: colors.surface, border: "none" }}
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
                const asset = assets.find((a) => a.symbol === h.symbol);
                if (!asset) return null;
                const gain = asset.price - h.acquisitionPrice;
                const gainPct = (gain / h.acquisitionPrice) * 100;
                const isG = gain >= 0;
                const isSel = h.symbol === selectedSymbol;
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
                      paddingTop: 8,
                      paddingBottom: 8,
                    }}
                  >
                    <p className="truncate text-[12px] font-semibold leading-snug" style={{ color: colors.textPrimary }}>
                      {h.name}
                    </p>
                    <div className="mt-[2px] flex items-center gap-[6px]">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: colors.textMuted }}>
                        PSA {h.grade}
                      </span>
                    </div>
                    <div className="mt-[4px] flex items-center justify-between">
                      <span className="tabular-nums text-[13px] font-bold" style={{ color: colors.textPrimary }}>
                        {formatCurrency(asset.price)}
                      </span>
                      <span className="tabular-nums text-[11px] font-semibold" style={{ color: isG ? colors.green : colors.red }}>
                        {isG ? "+" : ""}{gainPct.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {visibleAssets.map((asset) => {
            const assetUp = asset.change >= 0;
            const isSel = asset.symbol === selectedSymbol;
            const flash = flashMap[asset.symbol];

            return (
              <button
                key={asset.symbol}
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
                  <SparklineChart data={sparklines[asset.symbol] ?? []} isUp={assetUp} width={56} height={26} />
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
                    {assetUp ? "+" : ""}{asset.changePct.toFixed(2)}%
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
                    {isUp
                      ? <TrendingUp size={13} strokeWidth={2.5} style={{ color: colors.green }} />
                      : <TrendingDown size={13} strokeWidth={2.5} style={{ color: colors.red }} />
                    }
                    <span className="tabular-nums text-[13px] font-semibold" style={{ color: isUp ? colors.green : colors.red }}>
                      {isUp ? "+" : ""}{formatCurrency(selected.change)} ({isUp ? "+" : ""}{selected.changePct.toFixed(2)}%)
                    </span>
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
                      const h = holdings?.find(h => h.symbol === selected.symbol);
                      const hiResImage = selected.imageUrl || h?.imageUrl || `/cards/${selected.symbol}.svg`;
                      const psaThumbnail = h?.imageUrl && selected.imageUrl && h.imageUrl !== selected.imageUrl ? h.imageUrl : null;
                      const rawScan = h?.rawImageUrl || null;
                      // Build image list: hi-res first, then optional extras
                      const images = [hiResImage, ...(psaThumbnail ? [psaThumbnail] : []), ...(rawScan ? [rawScan] : [])].filter((v, i, a) => a.indexOf(v) === i);

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
                  <PriceChart data={chartData} isUp={isUp} range={range} onRangeChange={setRange} />
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
