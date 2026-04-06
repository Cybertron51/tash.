import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { catalogImageUrlOverride } from "@/lib/catalog-image-override";
import { isMissingMarketListedColumn } from "@/lib/market-listed-column";

type SearchRow = {
    id: string;
    symbol: string;
    name: string;
    set_name: string | null;
    category: string;
    psa_grade: number;
    population: number | null;
    image_url: string | null;
    prices?: unknown;
};

/** Prefer name matches over high-pop unrelated rows (e.g. don’t rank a random baseball slab above “Psyduck”). */
function rankSearchResults(qRaw: string, rows: SearchRow[]): SearchRow[] {
    const q = qRaw.trim().toLowerCase();
    if (!q || rows.length === 0) return rows;
    const scored = rows.map((row) => {
        const name = (row.name ?? "").toLowerCase();
        const sym = (row.symbol ?? "").toLowerCase();
        const setName = (row.set_name ?? "").toLowerCase();
        let tier = 10;
        if (name === q) tier = 0;
        else if (name.startsWith(q)) tier = 1;
        else if (name.includes(q)) tier = 2;
        else if (sym.includes(q)) tier = 3;
        else if (setName.includes(q)) tier = 4;
        const pop = Number(row.population) || 0;
        return { row, tier, pop };
    });
    scored.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : b.pop - a.pop));
    return scored.map((s) => s.row);
}

export async function GET(req: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "DB not configured" }, { status: 503 });
    }
    const db = supabaseAdmin;

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length === 0) {
        return NextResponse.json({ results: [] });
    }

    // Strip ILIKE wildcards / commas so user input can’t broaden the pattern or break PostgREST `.or()`.
    const cleaned = query.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) {
        return NextResponse.json({ results: [] });
    }

    // PostgREST: use `%term%` directly — wrapping in extra quotes breaks matching (see Supabase ilike docs).
    const pattern = `%${cleaned}%`;

    try {
        const searchSelect = `
                id,
                symbol,
                name,
                set_name,
                category,
                psa_grade,
                population,
                image_url,
                prices (
                    price
                )
            `;

        const runSearch = (listedOnly: boolean) => {
            let q = db.from("cards").select(searchSelect);
            if (listedOnly) q = q.eq("market_listed", true);
            return q.or(`name.ilike.${pattern},symbol.ilike.${pattern},set_name.ilike.${pattern}`).limit(50);
        };

        let { data, error } = await runSearch(true);
        if (error && isMissingMarketListedColumn(error)) {
            ({ data, error } = await runSearch(false));
        }

        if (error) throw error;

        const rows = (data ?? []) as SearchRow[];

        const ranked = rankSearchResults(cleaned, rows).slice(0, 10);

        const results = ranked.map((card) => {
            const priceObj = Array.isArray(card.prices) ? card.prices[0] : card.prices;
            const imageFix =
                catalogImageUrlOverride({
                    name: card.name,
                    setName: card.set_name ?? "",
                    category: card.category ?? "other",
                }) ?? card.image_url;
            return {
                ...card,
                image_url: imageFix,
                price: (priceObj as { price?: number } | null | undefined)?.price ?? null,
                prices: undefined,
            };
        });

        return NextResponse.json({ results });
    } catch (err: unknown) {
        console.error("Search API Error:", err);
        return NextResponse.json({ error: "Failed to search cards" }, { status: 500 });
    }
}
