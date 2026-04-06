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
      card_id,
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

    const rows = data || [];
    const cardIds = [...new Set(rows.map((r) => (r as { card_id?: string | null }).card_id).filter(Boolean))] as string[];

    let catalogImageByCardId: Record<string, string | null> = {};
    if (cardIds.length > 0) {
        const { data: cardRows } = await supabaseAdmin
            .from("cards")
            .select("id, image_url, image_url_hi")
            .in("id", cardIds);
        for (const c of cardRows ?? []) {
            const rec = c as { id: string; image_url: string | null; image_url_hi: string | null };
            const url = (rec.image_url_hi || rec.image_url || "").trim() || null;
            catalogImageByCardId[rec.id] = url;
        }
    }

    // Map to frontend-friendly format
    const holdings = rows.map((row: Record<string, unknown>) => {
        const cid = (row.card_id as string) ?? null;
        const catalogUrl = cid ? catalogImageByCardId[cid] ?? null : null;
        const vaultUrl = (row.image_url as string | null)?.trim() || null;
        const imageUrl =
            vaultUrl ||
            catalogUrl ||
            `/cards/${String(row.symbol)}.svg`;

        return {
            id: row.id,
            cardId: cid,
            name: (row.name as string) || "Unknown Card",
            symbol: row.symbol,
            grade: (row.psa_grade as number) || 9,
            set: (row.set_name as string) || "Unknown Set",
            year: (row.year as number) || new Date().getFullYear(),
            acquisitionPrice: Number(row.acquisition_price),
            status: row.status,
            dateDeposited: new Date(row.created_at as string).toISOString().split("T")[0],
            certNumber: (row.cert_number as string) || "Pending grading",
            imageUrl,
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

    // 1. DUPLICATE CHECK — Check if this cert number is already in the vault
    if (certNumber) {
        const { data: existingHolding } = await supabaseAdmin
            .from("vault_holdings")
            .select("id, user_id")
            .eq("cert_number", certNumber)
            .single();

        if (existingHolding) {
            if (existingHolding.user_id === auth.userId) {
                return NextResponse.json({
                    error: "This card is already in your vault.",
                    holdingId: existingHolding.id,
                    code: "DUPLICATE_HOLDING"
                }, { status: 409 });
            } else {
                return NextResponse.json({
                    error: "This card is already registered in another user's vault.",
                    code: "CERT_COLLISION"
                }, { status: 409 });
            }
        }
    }

    // 2. CARD CATALOG — Find or create the card entry in the marketplace catalog
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
                        image_url_hi: imageUrl || null, // High-res catalog entry should be official PSA image
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
            image_url: imageUrl || rawImageUrl || null,
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
    else if (rawImageUrl) updates.image_url = rawImageUrl;
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
