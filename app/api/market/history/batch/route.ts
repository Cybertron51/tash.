import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildBatchMarketHistory } from "@/lib/market-history-server";
import type { TimeRange } from "@/lib/chart-series";

const RANGES: TimeRange[] = ["1D", "1W", "1M", "3M", "1Y"];
const MAX_IDS = 80;

/**
 * GET /api/market/history/batch?cardIds=id1,id2&sparkline=1
 * Optional: &range=… (ignored when sparkline=1). With sparkline=1, uses the same 1W pipeline as the
 * Price Chart, then downsamples for list payloads (~42 points).
 */
export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("cardIds") || "";
  const sparkline = searchParams.get("sparkline") === "1" || searchParams.get("sparkline") === "true";
  const rangeParam = searchParams.get("range");
  const range: TimeRange =
    rangeParam && (RANGES as string[]).includes(rangeParam) ? (rangeParam as TimeRange) : "1W";

  const cardIds = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS);

  if (cardIds.length === 0) {
    return NextResponse.json({});
  }

  const data = await buildBatchMarketHistory(supabaseAdmin, cardIds, range, { sparkline });

  return NextResponse.json(data);
}
