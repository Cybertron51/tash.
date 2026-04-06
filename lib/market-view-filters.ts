/**
 * Pure filters for Market Simple vs Advanced views — single source of truth for search / browse rules.
 */

export type MarketCategory = "pokemon" | "sports" | "mtg" | "other";

export interface MarketFilterAsset {
  id: string;
  symbol: string;
  name: string;
  set: string;
  category: MarketCategory;
  price: number;
  volume24h: number;
  hasLiquidity?: boolean;
}

export type SimpleCategoryFilter = "all" | MarketCategory;
export type AdvancedCategoryFilter = "all" | "pokemon" | "sports" | "mtg";

/** Simple Market list: browse vs search rules (matches `SimpleView` marketAssets). */
export function filterSimpleMarketAssets<T extends MarketFilterAsset>(params: {
  assets: T[];
  query: string;
  portfolioSymbols: Set<string>;
  showNonTradable: boolean;
  categoryFilter: SimpleCategoryFilter;
  priceRange: [number, number] | null;
  minVolume: number;
}): T[] {
  const { assets, query, portfolioSymbols, showNonTradable, categoryFilter, priceRange, minVolume } = params;
  const qRaw = query.trim();

  let result = !qRaw
    ? assets.filter((a) => !portfolioSymbols.has(a.symbol))
    : assets.slice();

  if (qRaw) {
    const q = qRaw.toLowerCase();
    result = result.filter(
      (a) =>
        (a.name ?? "").toLowerCase().includes(q) ||
        (a.set ?? "").toLowerCase().includes(q) ||
        (a.symbol ?? "").toLowerCase().includes(q) ||
        (a.category ?? "").toLowerCase().includes(q)
    );
  } else if (!showNonTradable) {
    result = result.filter((a) => a.hasLiquidity);
  }

  const searching = qRaw.length > 0;
  if (!searching) {
    if (categoryFilter !== "all") {
      result = result.filter((a) => a.category === categoryFilter);
    }
    if (priceRange) {
      result = result.filter((a) => a.price >= priceRange[0] && a.price <= priceRange[1]);
    }
    if (minVolume > 0) {
      result = result.filter((a) => a.volume24h >= minVolume);
    }
  }

  return [...result].sort(
    (a, b) => (Number(b.volume24h) || 0) - (Number(a.volume24h) || 0)
  );
}

/** Advanced sidebar list: `visibleAssets` on market page. */
export function filterAdvancedVisibleAssets<T extends MarketFilterAsset>(params: {
  assets: T[];
  showNonTradable: boolean;
  categoryFilter: AdvancedCategoryFilter;
  priceRange: [number, number] | null;
  minVolume: number;
}): T[] {
  let result = params.showNonTradable ? params.assets : params.assets.filter((a) => a.hasLiquidity);

  if (params.categoryFilter !== "all") {
    result = result.filter((a) => a.category === params.categoryFilter);
  }
  if (params.priceRange) {
    const [lo, hi] = params.priceRange;
    result = result.filter((a) => a.price >= lo && a.price <= hi);
  }
  if (params.minVolume > 0) {
    result = result.filter((a) => a.volume24h >= params.minVolume);
  }

  return [...result].sort(
    (a, b) => (Number(b.volume24h) || 0) - (Number(a.volume24h) || 0)
  );
}

/** Which row is “selected” in Advanced mode: URL/catalog symbol wins, else first visible. */
export function resolveAdvancedSelectedAsset<T extends MarketFilterAsset>(params: {
  assets: T[];
  selectedSymbol: string;
  visibleAssets: T[];
}): T | null {
  const fromSymbol = params.assets.find((a) => a.symbol === params.selectedSymbol);
  if (fromSymbol) return fromSymbol;
  return params.visibleAssets[0] ?? null;
}

/**
 * When `/market?symbol=` is present after catalog load (Advanced selection + Simple deep link parent).
 */
export function selectionFromUrlSymbol(
  urlSymbol: string,
  newAssets: MarketFilterAsset[]
): { selectedSymbol: string; revealNonTradable: boolean } {
  const target = newAssets.find((a) => a.symbol === urlSymbol);
  if (target) {
    return {
      selectedSymbol: urlSymbol,
      revealNonTradable: !target.hasLiquidity,
    };
  }
  const initialVisible = newAssets.filter((a) => a.hasLiquidity);
  const fallback = initialVisible[0]?.symbol ?? newAssets[0]?.symbol ?? "";
  return { selectedSymbol: fallback, revealNonTradable: false };
}
