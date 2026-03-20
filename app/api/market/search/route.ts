import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/market/search?q=charizard&limit=20
 * Search cards by name.
 */
export async function GET(req: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!q.trim()) {
        return NextResponse.json([]);
    }

    const { data, error } = await supabaseAdmin
        .from("cards")
        .select(`
      id, symbol, name, category, set_name, set_id, year,
      rarity, psa_grade, population, image_url, image_url_hi,
      prices (price, change_24h, change_pct_24h)
    `)
        .ilike("name", `%${q}%`)
        .order("population", { ascending: false, nullsFirst: false })
        .limit(limit);

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

    return NextResponse.json(cards);
}
