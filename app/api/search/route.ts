import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "DB not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length === 0) {
        return NextResponse.json({ results: [] });
    }

    // Convert query to tsquery string for full-text search, or just rely on ilike
    // For simple search across name/set_name/symbol, we'll use an OR condition with ilike
    const searchTerm = `%${query}%`;

    try {
        const { data, error } = await supabaseAdmin
            .from("cards")
            .select(`
                id, 
                symbol, 
                name, 
                set_name, 
                psa_grade, 
                image_url,
                prices (
                    price
                )
            `)
            .or(`name.ilike.${searchTerm},symbol.ilike.${searchTerm},set_name.ilike.${searchTerm}`)
            .limit(10);

        if (error) throw error;

        // Flatten the price data
        const results = data.map(card => {
            const priceObj = Array.isArray(card.prices) ? card.prices[0] : card.prices;
            return {
                ...card,
                price: priceObj?.price || null,
                prices: undefined
            };
        });

        return NextResponse.json({ results });
    } catch (err: any) {
        console.error("Search API Error:", err);
        return NextResponse.json({ error: "Failed to search cards" }, { status: 500 });
    }
}
