import { describe, expect, it } from "vitest";
import {
  filterAdvancedVisibleAssets,
  filterSimpleMarketAssets,
  resolveAdvancedSelectedAsset,
  selectionFromUrlSymbol,
  type MarketFilterAsset,
} from "./market-view-filters";

function a(p: Partial<MarketFilterAsset> & Pick<MarketFilterAsset, "id" | "symbol" | "name">): MarketFilterAsset {
  return {
    set: "Test Set",
    category: "sports",
    price: 50,
    volume24h: 100,
    hasLiquidity: true,
    ...p,
  };
}

describe("filterSimpleMarketAssets", () => {
  const catalog: MarketFilterAsset[] = [
    a({ id: "1", symbol: "A", name: "Cameron Brink Rookie", category: "sports", volume24h: 300 }),
    a({ id: "2", symbol: "B", name: "Other Card", category: "pokemon", volume24h: 200 }),
    a({
      id: "3",
      symbol: "C",
      name: "Illiquid",
      category: "sports",
      hasLiquidity: false,
      volume24h: 50,
    }),
  ];

  it("browse mode excludes vault symbols but search scans full catalog", () => {
    const held = new Set<string>(["A"]);

    const browse = filterSimpleMarketAssets({
      assets: catalog,
      query: "",
      portfolioSymbols: held,
      showNonTradable: true,
      categoryFilter: "all",
      priceRange: null,
      minVolume: 0,
    });
    expect(browse.map((x) => x.symbol)).not.toContain("A");
    expect(browse.map((x) => x.symbol)).toContain("B");

    const search = filterSimpleMarketAssets({
      assets: catalog,
      query: "Cameron",
      portfolioSymbols: held,
      showNonTradable: true,
      categoryFilter: "all",
      priceRange: null,
      minVolume: 0,
    });
    expect(search.map((x) => x.symbol)).toContain("A");
  });

  it("search ignores category/price/volume filters so text matches are not silently dropped", () => {
    const rows = filterSimpleMarketAssets({
      assets: catalog,
      query: "Cameron",
      portfolioSymbols: new Set(),
      showNonTradable: true,
      categoryFilter: "pokemon",
      priceRange: [1, 2],
      minVolume: 99999,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.symbol).toBe("A");
  });

  it("browse mode applies category and price filters", () => {
    const rows = filterSimpleMarketAssets({
      assets: catalog,
      query: "",
      portfolioSymbols: new Set(),
      showNonTradable: true,
      categoryFilter: "pokemon",
      priceRange: null,
      minVolume: 0,
    });
    expect(rows.map((x) => x.symbol)).toEqual(["B"]);
  });

  it("hides illiquid when showNonTradable is false and not searching", () => {
    const rows = filterSimpleMarketAssets({
      assets: catalog,
      query: "",
      portfolioSymbols: new Set(),
      showNonTradable: false,
      categoryFilter: "all",
      priceRange: null,
      minVolume: 0,
    });
    expect(rows.map((x) => x.symbol)).not.toContain("C");
  });

  it("matches ticker when display name is empty", () => {
    const rows = filterSimpleMarketAssets({
      assets: [
        a({ id: "x", symbol: "CAM-PSA9", name: "", set: "Hoops" }),
        a({ id: "y", symbol: "Y", name: "Other" }),
      ],
      query: "CAM-PSA",
      portfolioSymbols: new Set(),
      showNonTradable: true,
      categoryFilter: "all",
      priceRange: null,
      minVolume: 0,
    });
    expect(rows.map((r) => r.symbol)).toEqual(["CAM-PSA9"]);
  });
});

describe("filterAdvancedVisibleAssets", () => {
  const catalog: MarketFilterAsset[] = [
    a({ id: "1", symbol: "T1", name: "One", category: "sports", volume24h: 10, hasLiquidity: true }),
    a({ id: "2", symbol: "T2", name: "Two", category: "pokemon", hasLiquidity: false, volume24h: 20 }),
  ];

  it("hides illiquid unless showNonTradable", () => {
    expect(
      filterAdvancedVisibleAssets({
        assets: catalog,
        showNonTradable: false,
        categoryFilter: "all",
        priceRange: null,
        minVolume: 0,
      }).map((x) => x.symbol)
    ).toEqual(["T1"]);

    expect(
      filterAdvancedVisibleAssets({
        assets: catalog,
        showNonTradable: true,
        categoryFilter: "all",
        priceRange: null,
        minVolume: 0,
      }).map((x) => x.symbol)
    ).toEqual(["T2", "T1"]);
  });
});

describe("resolveAdvancedSelectedAsset", () => {
  const catalog: MarketFilterAsset[] = [
    a({ id: "1", symbol: "DEEP", name: "Hidden Gem", price: 999, volume24h: 1 }),
    a({ id: "2", symbol: "TOP", name: "Top Vol", volume24h: 5000 }),
  ];

  it("uses full catalog match for selectedSymbol even if row is filtered out of visible list", () => {
    const visible = [catalog[1]!];
    const sel = resolveAdvancedSelectedAsset({
      assets: catalog,
      selectedSymbol: "DEEP",
      visibleAssets: visible,
    });
    expect(sel?.symbol).toBe("DEEP");
  });

  it("falls back to first visible when symbol not in catalog", () => {
    const sel = resolveAdvancedSelectedAsset({
      assets: catalog,
      selectedSymbol: "NOSUCH",
      visibleAssets: [catalog[1]!],
    });
    expect(sel?.symbol).toBe("TOP");
  });
});

describe("selectionFromUrlSymbol", () => {
  const catalog: MarketFilterAsset[] = [
    a({ id: "1", symbol: "CB", name: "Cameron Brink", hasLiquidity: true, volume24h: 10 }),
    a({ id: "2", symbol: "X", name: "Other", hasLiquidity: false, volume24h: 5 }),
  ];

  it("selects URL symbol and flags illiquid cards", () => {
    expect(selectionFromUrlSymbol("CB", catalog)).toEqual({
      selectedSymbol: "CB",
      revealNonTradable: false,
    });
    expect(selectionFromUrlSymbol("X", catalog)).toEqual({
      selectedSymbol: "X",
      revealNonTradable: true,
    });
  });

  it("falls back when symbol missing", () => {
    expect(selectionFromUrlSymbol("MISSING", catalog)).toEqual({
      selectedSymbol: "CB",
      revealNonTradable: false,
    });
  });
});
