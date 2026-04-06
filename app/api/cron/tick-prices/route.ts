import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual trigger for the same logic as Supabase `tick_market_prices` (sector-correlated random walk).
 * Primary automation: pg_cron → SELECT tick_market_prices(...) — see
 * `supabase/migrations/*tick_market*.sql` and `snippets/schedule_tick_market_prices.sql`.
 *
 * Security: Authorization: Bearer <CRON_SECRET>
 *
 * Query: maxPct (default 0.2), sectorBlend (default 0.65; 1 = pure sector shock, 0 = pure idiosyncratic),
 * minTicksPerDay / maxTicksPerDay (default 1..6): cap scheduled market ticks per card per UTC day (trades unaffected).
 */
function validCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get("authorization");
  return h === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  return handleTick(req);
}

export async function POST(req: NextRequest) {
  return handleTick(req);
}

async function handleTick(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Set CRON_SECRET to call this route (Supabase pg_cron does not use this endpoint)." },
      { status: 503 }
    );
  }
  if (!validCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const maxPct = Math.min(2, Math.max(0.02, parseFloat(searchParams.get("maxPct") ?? "0.2") || 0.2));
  const sectorBlend = Math.min(1, Math.max(0, parseFloat(searchParams.get("sectorBlend") ?? "0.65") || 0.65));
  let minTicksPerDay = parseInt(searchParams.get("minTicksPerDay") ?? "1", 10);
  let maxTicksPerDay = parseInt(searchParams.get("maxTicksPerDay") ?? "6", 10);
  if (!Number.isFinite(minTicksPerDay) || minTicksPerDay < 1) minTicksPerDay = 1;
  if (!Number.isFinite(maxTicksPerDay)) maxTicksPerDay = 6;
  maxTicksPerDay = Math.min(48, Math.max(minTicksPerDay, maxTicksPerDay));

  const { data, error } = await supabaseAdmin.rpc("tick_market_prices", {
    p_max_delta_pct: maxPct,
    p_sector_blend: sectorBlend,
    p_min_ticks_per_day: minTicksPerDay,
    p_max_ticks_per_day: maxTicksPerDay,
  });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "Apply migrations for tick_market_prices (sector + daily cap per card) if the RPC is missing.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    updated: data as number,
    engine: "postgres",
    maxPctPerTick: maxPct,
    sectorBlend,
    minTicksPerDay,
    maxTicksPerDay,
  });
}
