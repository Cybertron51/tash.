import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAuth, unauthorized } from "@/lib/supabase-admin";

/**
 * GET /api/vault/holdings — Returns the authenticated user's vault holdings.
 * POST /api/vault/holdings — Insert a new vault holding for the authenticated user.
 */
export async function GET(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const { data, error } = await supabaseAdmin
        .from("vault_holdings")
        .select(`
      id,
      symbol,
      name,
      set_name,
      year,
      psa_grade,
      status,
      acquisition_price,
      listing_price,
      cert_number,
      image_url,
      raw_image_url,
      created_at
    `)
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map to frontend-friendly format
    const holdings = (data || []).map((row: Record<string, unknown>) => {
        return {
            id: row.id,
            name: (row.name as string) || "Unknown Card",
            symbol: row.symbol,
            grade: (row.psa_grade as number) || 9,
            set: (row.set_name as string) || "Unknown Set",
            year: (row.year as number) || new Date().getFullYear(),
            acquisitionPrice: Number(row.acquisition_price),
            status: row.status,
            dateDeposited: new Date(row.created_at as string).toISOString().split("T")[0],
            certNumber: (row.cert_number as string) || "Pending grading",
            imageUrl: (row.image_url as string) || `/cards/${row.symbol}.svg`,
            rawImageUrl: (row.raw_image_url as string) || undefined,
            listingPrice: row.listing_price ? Number(row.listing_price) : undefined,
        };
    });

    return NextResponse.json(holdings);
}

export async function POST(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { symbol, acquisitionPrice, status, certNumber, imageUrl, rawImageUrl, cardId, cardMeta } = body;

    if (!symbol || acquisitionPrice === undefined) {
        return NextResponse.json({ error: "symbol and acquisitionPrice are required" }, { status: 400 });
    }

    let resolvedCardId = cardId || null;

    // If no existing card match, auto-create a cards + prices entry from scan metadata
    if (!resolvedCardId && cardMeta) {
        try {
            // Check if a card with this symbol already exists
            const { data: existingCard } = await supabaseAdmin
                .from("cards")
                .select("id")
                .eq("symbol", symbol)
                .single();

            if (existingCard) {
                resolvedCardId = existingCard.id;
            } else {
                // Create new card catalog entry
                const { data: newCard, error: cardError } = await supabaseAdmin
                    .from("cards")
                    .insert({
                        symbol,
                        name: cardMeta.name || "Unknown Card",
                        category: cardMeta.category || "other",
                        set_name: cardMeta.set || "Unknown Set",
                        year: cardMeta.year || null,
                        psa_grade: Math.min(Math.max(cardMeta.grade || 9, 8), 10),
                        image_url: imageUrl || null,
                        image_url_hi: rawImageUrl || imageUrl || null,
                        card_number: cardMeta.cardNumber || null,
                    })
                    .select("id")
                    .single();

                if (cardError) {
                    console.error("Failed to create card catalog entry:", cardError.message);
                } else if (newCard) {
                    resolvedCardId = newCard.id;

                    // Create initial price entry so the card shows in the market
                    const initialPrice = acquisitionPrice > 0 ? acquisitionPrice : 100;
                    await supabaseAdmin
                        .from("prices")
                        .insert({
                            card_id: newCard.id,
                            price: initialPrice,
                            change_24h: 0,
                            change_pct_24h: 0,
                            volume_24h: 0,
                        });
                }
            }
        } catch (err) {
            console.error("Error auto-creating card entry:", err);
        }
    }

    const { data, error } = await supabaseAdmin
        .from("vault_holdings")
        .insert({
            user_id: auth.userId,
            card_id: resolvedCardId,
            symbol,
            status: status || "pending_authentication",
            acquisition_price: acquisitionPrice,
            cert_number: certNumber || null,
            image_url: imageUrl || null,
            raw_image_url: rawImageUrl || null,
            name: cardMeta?.name || "Unknown Card",
            set_name: cardMeta?.set || "Unknown Set",
            year: cardMeta?.year || null,
            psa_grade: cardMeta?.grade || null,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const body = await req.json();
    const { id, symbol, acquisitionPrice, status, certNumber, imageUrl, rawImageUrl, cardMeta } = body;

    if (!id) {
        return NextResponse.json({ error: "Holding ID is required" }, { status: 400 });
    }

    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("vault_holdings")
        .select("user_id")
        .eq("id", id)
        .single();

    if (fetchError || !existing) {
        return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    if (existing.user_id !== auth.userId) {
        return unauthorized();
    }

    const updates: any = {
        updated_at: new Date().toISOString(),
    };

    if (symbol) updates.symbol = symbol;
    if (acquisitionPrice !== undefined) updates.acquisition_price = acquisitionPrice;
    if (status) updates.status = status;
    if (certNumber !== undefined) updates.cert_number = certNumber;
    if (imageUrl) updates.image_url = imageUrl;
    if (rawImageUrl !== undefined) updates.raw_image_url = rawImageUrl;

    if (cardMeta) {
        if (cardMeta.name) updates.name = cardMeta.name;
        if (cardMeta.set) updates.set_name = cardMeta.set;
        if (cardMeta.year) updates.year = cardMeta.year;
        if (cardMeta.grade) updates.psa_grade = cardMeta.grade;
    }

    const { data, error } = await supabaseAdmin
        .from("vault_holdings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
    const auth = await verifyAuth(req);
    if (!auth) return unauthorized();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "Holding ID is required" }, { status: 400 });
    }

    // Verify ownership and status
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("vault_holdings")
        .select("user_id, status")
        .eq("id", id)
        .single();

    if (fetchError || !existing) {
        return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    if (existing.user_id !== auth.userId) {
        return unauthorized();
    }

    // Only allow deleting disapproved or pending items
    if (!["disapproved", "pending_authentication"].includes(existing.status)) {
        return NextResponse.json({ error: "Only disapproved or pending items can be removed" }, { status: 400 });
    }

    const { error: deleteError } = await supabaseAdmin
        .from("vault_holdings")
        .delete()
        .eq("id", id);

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
