import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/market/orderbook?symbol=CHAR-PSA10
 * Returns the order book (bids + asks) for a symbol.
 */
export async function GET(req: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
        return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const { data: ordersData, error: ordersErr } = await supabaseAdmin
        .from("orders")
        .select("price, quantity, type")
        .eq("symbol", symbol)
        .eq("status", "open");

    if (ordersErr) {
        return NextResponse.json({ error: "Failed to fetch order book" }, { status: 500 });
    }

    // Aggregate by price
    const bidMap = new Map<number, number>();
    const askMap = new Map<number, number>();

    for (const row of ordersData || []) {
        const p = Number(row.price);
        if (row.type === "buy") {
            bidMap.set(p, (bidMap.get(p) || 0) + row.quantity);
        } else if (row.type === "sell") {
            askMap.set(p, (askMap.get(p) || 0) + row.quantity);
        }
    }

    // Convert to arrays
    let bids = Array.from(bidMap.entries()).map(([price, size]) => ({
        price, size, total: 0, depth: 0,
    }));
    bids.sort((a, b) => b.price - a.price);

    let asks = Array.from(askMap.entries()).map(([price, size]) => ({
        price, size, total: 0, depth: 0,
    }));
    asks.sort((a, b) => a.price - b.price);

    // Compute totals and depth
    let bidTotal = 0;
    for (const b of bids) { bidTotal += b.size; b.total = bidTotal; }
    let askTotal = 0;
    for (const a of asks) { askTotal += a.size; a.total = askTotal; }

    const maxTotal = Math.max(bidTotal, askTotal);
    if (maxTotal > 0) {
        for (const b of bids) b.depth = b.total / maxTotal;
        for (const a of asks) a.depth = a.total / maxTotal;
    }

    // Asks remain sorted lowest→highest. asks[0] = best ask (lowest price).
    // The OrderBook display component will render them reversed (highest at top).

    // Spread
    let spread = 0;
    let spreadPct = 0;
    if (asks.length > 0 && bids.length > 0) {
        const lowestAsk = asks[0].price;
        const highestBid = bids[0].price;
        spread = Math.max(0, lowestAsk - highestBid);
        if (lowestAsk > 0) spreadPct = spread / lowestAsk;
    }

    return NextResponse.json({ asks, bids, spread, spreadPct });
}
