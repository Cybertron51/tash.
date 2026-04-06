import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase as globalSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    console.log("--- INCOMING ORDER REQUEST ---");
    console.log("All headers:", Object.fromEntries(req.headers.entries()));
    console.log("Auth header received:", authHeader);

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({
        error: "Missing or invalid authorization header",
        debug_headers: Object.fromEntries(req.headers.entries()),
        received_auth: authHeader
      }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const body = await req.json();
    const { symbol, priceUsd, isBuy, quantity } = body;

    if (!symbol || priceUsd === undefined || isBuy === undefined || quantity === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (typeof priceUsd !== "number" || priceUsd <= 0) {
      return NextResponse.json({ error: "Invalid price: must be greater than 0" }, { status: 400 });
    }

    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Invalid quantity: must be a positive integer" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Create an authenticated client scoped to the user's token so RLS applies
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      console.error("Auth Error details:", authError);
      return NextResponse.json({ error: "Unauthorized or invalid token", details: authError }, { status: 401 });
    }

    if (!authData.user.email_confirmed_at) {
      return NextResponse.json({ error: "Please confirm your email before trading." }, { status: 403 });
    }

    const userId = authData.user.id;

    if (!globalSupabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    // Use service role client for all RPC calls (anon key blocked by RLS)
    const supabaseServiceUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseServiceUrl, supabaseServiceKey);

    if (isBuy) {
      const { data: sellRows, error: sellListErr } = await adminClient
        .from("orders")
        .select("quantity")
        .eq("symbol", symbol)
        .eq("type", "sell")
        .eq("status", "open");

      if (sellListErr) {
        console.error("Listed supply check:", sellListErr);
        return NextResponse.json({ error: "Could not verify listed supply." }, { status: 500 });
      }

      const listedSupply = (sellRows ?? []).reduce(
        (sum, row) => sum + Number(row.quantity ?? 0),
        0
      );
      if (quantity > listedSupply) {
        return NextResponse.json(
          {
            error:
              listedSupply === 0
                ? "No cards are listed for sale for this symbol."
                : `Order size exceeds listed supply (${listedSupply} available).`,
          },
          { status: 400 }
        );
      }

      const { error: rpcErr } = await adminClient.rpc("place_order", {
        p_user_id: userId,
        p_symbol: symbol,
        p_type: "buy",
        p_price: priceUsd,
        p_quantity: quantity
      });

      if (rpcErr) {
        console.error("Match order error:", rpcErr);
        return NextResponse.json({ error: "Failed to place or settle order: " + rpcErr.message }, { status: 500 });
      }

      return NextResponse.json({
        status: "success",
        message: "Buy order placed and matched successfully."
      });

    } else {
      // Selling — find tradable holdings then place orders via admin client

      const { data: holdings, error: fetchErr } = await adminClient
        .from("vault_holdings")
        .select("id")
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .eq("status", "tradable")
        .limit(quantity);

      if (fetchErr || !holdings || holdings.length < quantity) {
        return NextResponse.json({ error: "Not enough tradable inventory in your vault." }, { status: 400 });
      }

      // Execute place_order RPC for each holding individually via service role
      for (const holding of holdings) {
        const { error: rpcErr } = await adminClient.rpc("place_order", {
          p_user_id: userId,
          p_symbol: symbol,
          p_type: "sell",
          p_price: priceUsd,
          p_quantity: 1,
          p_holding_id: holding.id
        });

        if (rpcErr) {
          console.error("Place order error:", rpcErr);
          return NextResponse.json({ error: "Failed to place or settle order: " + rpcErr.message }, { status: 500 });
        }
      }

      return NextResponse.json({
        status: "success",
        message: "Sell order(s) placed and matched successfully."
      });
    }

  } catch (err) {
    console.error("POST /api/orders error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    // Verify the user's identity via JWT
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use admin client for the RPC call (RLS blocks anon key)
    // SECURITY: cancel_order enforces ownership via p_user_id match in the WHERE clause
    const supabaseServiceUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseServiceUrl, supabaseServiceKey);

    const { error: rpcErr } = await adminClient.rpc("cancel_order", {
      p_order_id: orderId,
      p_user_id: authData.user.id
    });

    if (rpcErr) {
      console.error("Cancel order error:", rpcErr);
      return NextResponse.json({ error: "Failed to cancel order: " + rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Order cancelled." });
  } catch (err) {
    console.error("DELETE /api/orders error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Anti-scraping check
  const apiSecret = process.env.NEXT_PUBLIC_API_SECRET;
  const clientSecret = req.headers.get("x-api-secret");

  if (apiSecret && clientSecret !== apiSecret) {
    return NextResponse.json({ error: "Forbidden: Invalid API Secret" }, { status: 403 });
  }

  if (!globalSupabase) return NextResponse.json({ orders: [], count: 0 });

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');

  let query = globalSupabase
    .from("orders")
    .select("id, symbol, type, price, quantity, user_id, created_at")
    .eq("status", "open")
    .order("price", { ascending: false });

  if (symbol) {
    query = query.eq("symbol", symbol);
  }

  const { data, error } = await query;

  if (error || !data) {
    return NextResponse.json({ orders: [], count: 0 });
  }

  const open = data.map((entry) => ({
    id: entry.id,
    cardName: entry.symbol,
    side: entry.type,
    priceUsd: entry.price,
    quantity: entry.quantity.toString(),
    makerShort: entry.user_id.slice(0, 8) + "…",
    createdAt: new Date(entry.created_at).getTime(),
  }));

  return NextResponse.json({ orders: open, count: open.length });
}
