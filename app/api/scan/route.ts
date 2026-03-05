/**
 * TASH — Card Scan API
 *
 * POST /api/scan
 * Accepts a base64-encoded card image, sends it to Gemini for AI identification,
 * and returns structured card data plus an optional matched market symbol.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getMarketCards } from "@/lib/db/cards";
import { fetchPSAImage, fetchPSAMetadata, uploadCardImageToStorage, uploadRawScanToStorage } from "@/lib/psa";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_GENERATIVE_API_KEY ?? "");

function buildPrompt() {
  return `Analyze this image of a trading card slab and return ONLY a single JSON object — no markdown, no code fences, no explanation.

Return exactly this structure:
{
  "isFullSlabVisible": true,
  "certNumber": "12345678",
  "cardName": "Charizard-Holo",
  "setName": "Base Set",
  "year": 1999,
  "psaGrade": 10,
  "category": "pokemon"
}

Valid values:
- isFullSlabVisible: boolean. Set to true if the PSA label and the trading card body are clearly visible. It is OKAY if the very outer plastic edges of the slab are slightly cropped, as long as the label text and the card art are fully visible. If the card itself is cut off or the label is missing, set to false.
- certNumber: Extract the 7 or 8-digit certification number from the PSA label. If you cannot read it clearly, return null.
- cardName: Read the card name from the PSA label text. The PSA label always includes the card name (e.g. "Charizard-Holo", "Blastoise", "Mickey Mouse"). If the PSA label is not readable, identify the card from the card art itself. Always return a descriptive name, never return null or "Unknown".
- setName: Read the set/brand name from the PSA label (e.g. "Base Set", "Pokemon Game", "Topps Chrome"). If not readable, make your best guess based on the card art. Never return null.
- year: Read the year from the PSA label. If not readable, estimate from the card design. Return as a number.
- psaGrade: Read the numeric grade from the PSA label. The grade is the large number on the label, often preceded by a text descriptor like "GEM MT" (10), "MINT" (9), "NM-MT" (8), "NM" (7), etc. Return just the number (e.g. 10, 9, 8). If not readable, return null.
- category: "pokemon" if it's a Pokémon card, "sports" if it's a sports card (baseball, basketball, football, etc), "other" for anything else.

Return ONLY the JSON.`;
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, certNumberLocalScan } = await req.json();

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: "Missing imageBase64 or mimeType" },
        { status: 400 }
      );
    }

    const validMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validMimeTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported image type" },
        { status: 400 }
      );
    }

    // Helper: build card object from PSA metadata
    function buildCardFromPSA(psaData: any, certNumber: string): any {
      const card: any = {
        isFullSlabVisible: true,
        certNumber,
        name: psaData.Subject || psaData.Player || "Unknown Card",
        set: psaData.CardSet || psaData.Brand || "Unknown Set",
        year: parseInt(psaData.Year) || null,
        cardNumber: psaData.CardNumber || null,
        estimatedGrade: psaData.CardGrade
          ? parseInt(psaData.CardGrade.replace(/\D/g, "")) || 9
          : 9,
        category: "pokemon",
      };

      // Refine category from PSA data
      const subject = (psaData.Subject || "").toLowerCase();
      const cardSet = (psaData.CardSet || "").toLowerCase();
      const brand = (psaData.Brand || "").toLowerCase();
      if (subject.includes("pokemon") || cardSet.includes("pokemon")) card.category = "pokemon";
      else if (brand.includes("panini") || brand.includes("topps")) card.category = "sports";
      else card.category = "other";

      return card;
    }

    // Helper: fetch PSA image and upload to Supabase
    async function determineImageUrl(certNumber: string | null): Promise<string | null> {
      if (!certNumber) return null;
      console.log(`Attempting to fetch PSA image for cert ${certNumber}`);
      const psaImageUrl = await fetchPSAImage(certNumber);
      if (psaImageUrl) {
        console.log(`Found PSA image, uploading to Supabase...`);
        const supabaseUrl = await uploadCardImageToStorage(psaImageUrl, certNumber);
        if (supabaseUrl) {
          console.log(`Successfully uploaded PSA image: ${supabaseUrl}`);
          return supabaseUrl;
        }
      }
      return null;
    }

    // ─── FAST PATH: barcode cert number already available → skip Gemini ───
    if (certNumberLocalScan) {
      console.log(`Barcode cert number detected: ${certNumberLocalScan} — using PSA API directly (skipping Gemini)`);
      const psaData = await fetchPSAMetadata(certNumberLocalScan);

      if (psaData) {
        const card = buildCardFromPSA(psaData, certNumberLocalScan);

        // Fuzzy-match, image fetch, and raw scan upload in parallel
        const [matchedAsset, imageUrl, rawImageUrl] = await Promise.all([
          getMarketCards().then((dbCards) => {
            const cardNameLower = (card.name ?? "").toLowerCase();
            return (dbCards ?? []).find((a) => {
              const assetName = a.name.toLowerCase();
              const firstWord = assetName.split(" ")[0];
              return (
                assetName.includes(cardNameLower) ||
                cardNameLower.includes(assetName) ||
                (firstWord.length > 3 && cardNameLower.includes(firstWord))
              );
            }) ?? null;
          }),
          determineImageUrl(certNumberLocalScan),
          uploadRawScanToStorage(imageBase64, mimeType),
        ]);

        return NextResponse.json({
          card,
          matchedSymbol: matchedAsset?.symbol ?? null,
          imageUrl,
          rawImageUrl,
          pricing: null,
        });
      }

      // PSA lookup failed for this cert number — fall through to Gemini
      console.warn(`PSA lookup failed for cert ${certNumberLocalScan}, falling back to Gemini`);
    }

    // ─── SLOW PATH: no barcode → use Gemini AI to identify the card ───
    console.log("No barcode cert number available — using Gemini AI to identify card");
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent([
      { inlineData: { mimeType, data: imageBase64 } },
      { text: buildPrompt() },
    ]);

    const rawText = result.response.text();
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let aiResult;
    try {
      aiResult = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 422 });
    }

    // Build card from AI result
    const extractedCert = aiResult.certNumber || null;
    const card: any = {
      isFullSlabVisible: !!aiResult.isFullSlabVisible,
      certNumber: extractedCert,
      name: aiResult.cardName || "Unknown Card",
      set: aiResult.setName || "Unknown Set",
      year: aiResult.year || null,
      cardNumber: null,
      estimatedGrade: aiResult.psaGrade || null,
      category: aiResult.category || "pokemon",
    };

    // If Gemini couldn't find a cert number, flag the card
    if (!extractedCert) {
      console.warn("Gemini could not detect a barcode or cert number — flagging card");
      card.isFullSlabVisible = false;
    }

    // If Gemini extracted a cert number, enrich with PSA data
    if (extractedCert) {
      console.log(`Gemini extracted cert ${extractedCert} — enriching with PSA metadata`);
      const psaData = await fetchPSAMetadata(extractedCert);

      if (psaData) {
        card.name = psaData.Subject || psaData.Player || card.name;
        card.set = psaData.CardSet || psaData.Brand || card.set;
        card.year = parseInt(psaData.Year) || card.year;
        card.cardNumber = psaData.CardNumber || null;
        card.estimatedGrade = psaData.CardGrade
          ? parseInt(psaData.CardGrade.replace(/\D/g, "")) || card.estimatedGrade || 9
          : card.estimatedGrade || 9;

        if ((psaData.Subject || "").toLowerCase().includes("pokemon") || (psaData.CardSet || "").toLowerCase().includes("pokemon")) card.category = "pokemon";
        else if ((psaData.Brand || "").toLowerCase().includes("panini") || (psaData.Brand || "").toLowerCase().includes("topps")) card.category = "sports";
      } else {
        card.isFullSlabVisible = false;
      }
    }

    // Fuzzy-match, image fetch, and raw scan upload in parallel
    const cardNameLower = (card.name ?? "").toLowerCase();
    const [dbCards, imageUrl, rawImageUrl] = await Promise.all([
      getMarketCards(),
      determineImageUrl(card.certNumber),
      uploadRawScanToStorage(imageBase64, mimeType),
    ]);

    const matchedAsset = (dbCards ?? []).find((a) => {
      const assetName = a.name.toLowerCase();
      const firstWord = assetName.split(" ")[0];
      return (
        assetName.includes(cardNameLower) ||
        cardNameLower.includes(assetName) ||
        (firstWord.length > 3 && cardNameLower.includes(firstWord))
      );
    });

    return NextResponse.json({
      card,
      matchedSymbol: matchedAsset?.symbol ?? null,
      imageUrl,
      rawImageUrl,
      pricing: null,
    });
  } catch (error) {
    console.error("Scan API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
