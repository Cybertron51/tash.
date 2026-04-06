/**
 * TASH — Root Layout
 *
 * Hierarchy (top → bottom):
 *  ┌──────────────────────────────────────────┐
 *  │  GlobalTicker  (40px, fixed, z:110)      │  ← marquee price bar
 *  ├──────────────────────────────────────────┤
 *  │  Navigation    (56px, fixed, z:100)      │  ← nav + search + account
 *  ├──────────────────────────────────────────┤
 *  │                                          │
 *  │  <main> — page content area              │
 *  │                                          │
 *  └──────────────────────────────────────────┘
 */

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

import { GlobalTicker } from "@/components/layout/GlobalTicker";
import { Navigation } from "@/components/layout/Navigation";
import { Providers } from "@/components/providers/Providers";

import { layout } from "@/lib/theme";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapDBCardToAssetData } from "@/lib/market-data";
import { batchSevenDayChangeFromTrades } from "@/lib/market-history-server";
import { isMissingMarketListedColumn } from "@/lib/market-listed-column";

// ─────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: "tash.",
    template: "%s · tash.",
  },
  description:
    "Institutional-grade trading for PSA 8+ graded cards. Real-time price discovery, order books, and secure vault storage.",
  keywords: [
    "trading card exchange",
    "PSA",
    "graded cards",
    "Pokémon",
    "sports cards",
    "collectibles market",
  ],
  verification: {
    google: "SWWyYQ61cKdxzvyEMKqijk7OaNzFQLIInQo8F6tgxUs",
  },
  openGraph: {
    title: "tash. — Trading Card Exchange",
    description: "Institutional-grade trading for PSA-graded collectibles.",
    type: "website",
  },
};

// ─────────────────────────────────────────────────────────
// Layout Component
// ─────────────────────────────────────────────────────────

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let tickerItems: ReturnType<typeof mapDBCardToAssetData>[] = [];

  if (supabaseAdmin) {
    const tickerQuery = (listedOnly: boolean) => {
      let q = supabaseAdmin!.from("cards").select("*, prices(*)");
      if (listedOnly) q = q.eq("market_listed", true);
      return q.limit(12);
    };
    let { data: dbCards, error: tickerErr } = await tickerQuery(true);
    if (tickerErr && isMissingMarketListedColumn(tickerErr)) {
      ({ data: dbCards } = await tickerQuery(false));
    }

    if (dbCards && dbCards.length > 0) {
      const metrics = await batchSevenDayChangeFromTrades(
        supabaseAdmin,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dbCards.map((c: any) => ({ id: c.id, symbol: c.symbol }))
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tickerItems = dbCards.map((c: any) => {
        const p = Array.isArray(c.prices) ? c.prices[0] : c.prices;
        const m = metrics.get(c.id);
        return mapDBCardToAssetData({
          ...c,
          price: p?.price ?? 0,
          change_24h: p?.change_24h ?? 0,
          change_pct_24h: p?.change_pct_24h ?? 0,
          change_7d: m?.change_7d ?? 0,
          change_pct_7d: m?.change_pct_7d ?? 0,
          high_24h: p?.high_24h ?? null,
          low_24h: p?.low_24h ?? null,
          volume_24h: p?.volume_24h ?? 0,
        });
      });
    }
  }

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers>
          {/* ── Fixed chrome: ticker + nav ── */}
          <div
            className="fixed left-0 right-0 top-0"
            style={{ zIndex: 110 }}
          >
            {tickerItems.length > 0 && <GlobalTicker items={tickerItems} />}
            <Navigation />
          </div>

          {/* ── Page content — offset by chrome height (40px ticker + 56px nav) ── */}
          <main
            style={{
              paddingTop: layout.chromeHeight,
              minHeight: "100dvh",
            }}
          >
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
