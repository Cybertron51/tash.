import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { batchSevenDayChangeFromTrades } from "@/lib/market-history-server";
import { applyPeerPriceFallback } from "@/lib/peer-price-fallback";
import { isMissingMarketListedColumn } from "@/lib/market-listed-column";

/**
 * GET /api/market/cards
 * Public market data — returns all cards with prices.
 * Query params: ?category=pokemon&grade=9&limit=50
 */
export async function GET(req: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const db = supabaseAdmin;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const grade = searchParams.get("grade");
    const limit = searchParams.get("limit");

    const cardListSelect = `
      id, symbol, name, category, set_name, set_id, year,
      rarity, artist, hp, card_types, card_number,
      psa_grade, population, image_url, image_url_hi, pokemon_card_id,
      prices (price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
    `;

    const buildQuery = (listedOnly: boolean) => {
        let q = db.from("cards").select(cardListSelect);
        if (listedOnly) q = q.eq("market_listed", true);
        if (category) q = q.eq("category", category);
        if (grade) q = q.eq("psa_grade", parseInt(grade));
        if (limit) q = q.limit(parseInt(limit));
        return q.order("created_at", { ascending: false });
    };

    let { data, error } = await buildQuery(true);
    if (error && isMissingMarketListedColumn(error)) {
        ({ data, error } = await buildQuery(false));
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the nested prices join
    const cards = (data ?? []).map((row: Record<string, unknown>) => {
        const prices = (row.prices as Record<string, unknown> | null) ?? {};
        const { prices: _drop, ...rest } = row;
        return {
            ...rest,
            price: (prices.price as number) ?? 0,
            change_24h: (prices.change_24h as number) ?? 0,
            change_pct_24h: (prices.change_pct_24h as number) ?? 0,
            high_24h: (prices.high_24h as number) ?? null,
            low_24h: (prices.low_24h as number) ?? null,
            volume_24h: (prices.volume_24h as number) ?? 0,
        };
    });

    type CardRow = (typeof cards)[number] & {
        id: string;
        symbol: string;
        category: string;
        psa_grade: number;
    };
    const withIds = cards as CardRow[];

    const metrics = await batchSevenDayChangeFromTrades(
        supabaseAdmin,
        withIds.map((c) => ({ id: c.id, symbol: c.symbol }))
    );

    const merged = withIds.map((c) => {
        const m = metrics.get(c.id);
        return {
            ...c,
            change_7d: m?.change_7d ?? 0,
            change_pct_7d: m?.change_pct_7d ?? 0,
        };
    });

    const needsSynthetic = new Set(
        merged.filter((c) => !(Number(c.price) > 0)).map((c) => String(c.id))
    );

    const withPeers = applyPeerPriceFallback(
        merged.map((c) => ({
            ...c,
            category: String(c.category ?? "other"),
            psa_grade: Number(c.psa_grade),
            price: Number(c.price),
        }))
    );

    const out = withPeers.map((c) =>
        needsSynthetic.has(String(c.id))
            ? { ...c, change_7d: 0, change_pct_7d: 0 }
            : c
    );

    return NextResponse.json(out);
}
