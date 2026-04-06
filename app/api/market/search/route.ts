import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { batchSevenDayChangeFromTrades } from "@/lib/market-history-server";
import { isMissingMarketListedColumn } from "@/lib/market-listed-column";

/**
 * GET /api/market/search?q=charizard&limit=20
 * Search cards by name.
 */
export async function GET(req: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const db = supabaseAdmin;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!q.trim()) {
        return NextResponse.json([]);
    }

    const nameSearchSelect = `
      id, symbol, name, category, set_name, set_id, year,
      rarity, psa_grade, population, image_url, image_url_hi,
      prices (price, change_24h, change_pct_24h)
    `;

    const runNameSearch = (listedOnly: boolean) => {
        let qb = db.from("cards").select(nameSearchSelect);
        if (listedOnly) qb = qb.eq("market_listed", true);
        return qb
            .ilike("name", `%${q}%`)
            .order("population", { ascending: false, nullsFirst: false })
            .limit(limit);
    };

    let { data, error } = await runNameSearch(true);
    if (error && isMissingMarketListedColumn(error)) {
        ({ data, error } = await runNameSearch(false));
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cards = (data ?? []).map((row: Record<string, unknown>) => {
        const prices = (row.prices as Record<string, unknown> | null) ?? {};
        const { prices: _drop, ...rest } = row;
        return {
            ...rest,
            price: (prices.price as number) ?? 0,
            change_24h: (prices.change_24h as number) ?? 0,
            change_pct_24h: (prices.change_pct_24h as number) ?? 0,
        };
    });

    type CardRow = (typeof cards)[number] & { id: string; symbol: string };
    const withIds = cards as CardRow[];

    const metrics = await batchSevenDayChangeFromTrades(
        db,
        withIds.map((c) => ({ id: c.id, symbol: c.symbol }))
    );

    return NextResponse.json(
        withIds.map((c) => {
            const m = metrics.get(c.id);
            return {
                ...c,
                change_7d: m?.change_7d ?? 0,
                change_pct_7d: m?.change_pct_7d ?? 0,
            };
        })
    );
}
