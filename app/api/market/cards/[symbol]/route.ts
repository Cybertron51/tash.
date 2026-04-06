import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { batchSevenDayChangeFromTrades } from "@/lib/market-history-server";
import { fetchPeerMedianFromDb, synthesizePeerPrice } from "@/lib/peer-price-fallback";
import { isMissingMarketListedColumn } from "@/lib/market-listed-column";

/**
 * GET /api/market/cards/[symbol]
 * Returns a single card by its trading symbol.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const db = supabaseAdmin;

    const { symbol } = await params;

    const detailSelect = `
      id, symbol, name, category, set_name, set_id, year,
      rarity, artist, hp, card_types, card_number,
      psa_grade, population, image_url, image_url_hi, pokemon_card_id,
      prices (price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
    `;

    const fetchBySymbol = (listedOnly: boolean) => {
        let q = db.from("cards").select(detailSelect).eq("symbol", symbol);
        if (listedOnly) q = q.eq("market_listed", true);
        return q.single();
    };

    let { data, error } = await fetchBySymbol(true);
    if (error && isMissingMarketListedColumn(error)) {
        ({ data, error } = await fetchBySymbol(false));
    }

    if (error || !data) {
        return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pricesRaw = data.prices as any;
    const prices = (Array.isArray(pricesRaw) ? pricesRaw[0] : pricesRaw) ?? {};
    const { prices: _drop, ...rest } = data;

    const metrics = await batchSevenDayChangeFromTrades(db, [
        { id: rest.id as string, symbol: rest.symbol as string },
    ]);
    const m = metrics.get(rest.id as string);

    let price = (prices.price as number) ?? 0;
    let change_24h = (prices.change_24h as number) ?? 0;
    let change_pct_24h = (prices.change_pct_24h as number) ?? 0;
    let high_24h = (prices.high_24h as number) ?? null;
    let low_24h = (prices.low_24h as number) ?? null;
    let change_7d = m?.change_7d ?? 0;
    let change_pct_7d = m?.change_pct_7d ?? 0;

    if (!(price > 0)) {
        const med = await fetchPeerMedianFromDb(
            db,
            String(rest.category ?? "other"),
            Number(rest.psa_grade),
            rest.id as string
        );
        price =
            med != null
                ? synthesizePeerPrice(rest.id as string, med)
                : synthesizePeerPrice(rest.id as string, 25);
        change_24h = 0;
        change_pct_24h = 0;
        change_7d = 0;
        change_pct_7d = 0;
        high_24h = price;
        low_24h = price;
    }

    return NextResponse.json({
        ...rest,
        price,
        change_24h,
        change_pct_24h,
        change_7d,
        change_pct_7d,
        high_24h,
        low_24h,
        volume_24h: (prices.volume_24h as number) ?? 0,
    });
}
