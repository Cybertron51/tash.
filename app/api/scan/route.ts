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
  "isCleanBackground": true,
  "isFillingScreen": true,
  "certNumber": "12345678",
  "cardName": "Charizard-Holo",
  "setName": "Base Set",
  "year": 1999,
  "psaGrade": 10,
  "category": "pokemon"
}

Valid values:
- isFullSlabVisible: boolean. Must be true. The PSA label and the trading card body must be fully visible. If the card is cut off or the label is missing, set to false.
- isCleanBackground: boolean. Set to true ONLY if the card is on a clean, monocolor, non-distracting background (e.g. a plain desk, a playmat). If there are other objects, hands, or a cluttered background, set to false.
- isFillingScreen: boolean. Set to true ONLY if the trading card slab occupies at least 70% of the image area. If the card is too far away or small, set to false.
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

      const subject = (psaData.Subject || "").toLowerCase();
      const cardSet = (psaData.CardSet || "").toLowerCase();
      const brand = (psaData.Brand || "").toLowerCase();
      if (subject.includes("pokemon") || cardSet.includes("pokemon")) card.category = "pokemon";
      else if (brand.includes("panini") || brand.includes("topps") || brand.includes("upper deck") || brand.includes("bowman")) card.category = "sports";
      else if (subject.includes("magic") || cardSet.includes("magic") || cardSet.includes("mtg") || brand.includes("wizards")) card.category = "mtg";
      else card.category = "other";

      return card;
    }

    async function determineImageUrl(certNumber: string | null): Promise<string | null> {
      if (!certNumber) return null;
      const psaImageUrl = await fetchPSAImage(certNumber);
      if (psaImageUrl) {
        return await uploadCardImageToStorage(psaImageUrl, certNumber);
      }
      return null;
    }

    let card: any = null;
    let imageUrl: string | null = null;
    let rawImageUrl: string | null = null;
    let psaData: any = null;

    // ─── FAST PATH: barcode cert number already available ───
    if (certNumberLocalScan) {
      console.log(`Barcode Detected: ${certNumberLocalScan}`);
      psaData = await fetchPSAMetadata(certNumberLocalScan);

      if (psaData) {
        card = buildCardFromPSA(psaData, certNumberLocalScan);
      }
    }

    // ─── SLOW PATH: fallback or no barcode → Gemini AI ───
    if (!card) {
      console.log("Using Gemini AI identification...");
      const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
      const result = await model.generateContent([
        { inlineData: { mimeType, data: imageBase64 } },
        { text: buildPrompt() },
      ]);

      const rawText = result.response.text();
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

      try {
        const aiResult = JSON.parse(cleaned);
        const extractedCert = aiResult.certNumber || null;

        // Quality Validation
        const isFullSlab = !!aiResult.isFullSlabVisible;
        const isCleanBg = !!aiResult.isCleanBackground;
        const isFilling = !!aiResult.isFillingScreen;

        card = {
          isFullSlabVisible: isFullSlab,
          isCleanBackground: isCleanBg,
          isFillingScreen: isFilling,
          certNumber: extractedCert,
          name: aiResult.cardName || "Unknown Card",
          set: aiResult.setName || "Unknown Set",
          year: aiResult.year || null,
          cardNumber: null,
          estimatedGrade: aiResult.psaGrade || 9,
          category: aiResult.category || "pokemon",
        };

        if (extractedCert && !psaData) {
          psaData = await fetchPSAMetadata(extractedCert);
          if (psaData) {
            const enriched = buildCardFromPSA(psaData, extractedCert);
            card = { ...card, ...enriched, isFullSlabVisible: true };
          }
        }

        // Strict Enforcement: If no PSA image is found, the user scan MUST be perfect
        // (However, we only have imageUrl AFTER determineImageUrl runs below).
        // So we'll run the check AFTER the parallel tasks.
      } catch (e) {
        console.error("AI Parse Error:", e);
        return NextResponse.json({ error: "Failed to identify card" }, { status: 422 });
      }
    }

    // ─── Post-Identification: Parallel tasks ───
    const [dbCards, loadedImageUrl, loadedRawImageUrl] = await Promise.all([
      getMarketCards(),
      determineImageUrl(card.certNumber),
      uploadRawScanToStorage(imageBase64, mimeType),
    ]);

    imageUrl = loadedImageUrl;
    rawImageUrl = loadedRawImageUrl;

    // ─── Strict Quality Enforcement ───
    // If we couldn't fetch an official PSA image, the user's scan must be high quality.
    if (!imageUrl) {
      if (!card.isFullSlabVisible) {
        return NextResponse.json({ error: "Unacceptable Scan: The full trading card slab (label and body) must be visible." }, { status: 422 });
      }
      if (!card.isCleanBackground) {
        return NextResponse.json({ error: "Unacceptable Scan: Please use a clean, monocolor background with no other objects." }, { status: 422 });
      }
      if (!card.isFillingScreen) {
        return NextResponse.json({ error: "Unacceptable Scan: The card must fill most of the screen. Move closer and try again." }, { status: 422 });
      }
    }

    // ─── Symbol Matching (Crucial for preventing duplicates) ───
    const cardNameLower = (card.name ?? "").toLowerCase();
    const cardSetLower = (card.set ?? "").toLowerCase();

    const matchedAsset = (dbCards ?? []).find((a: any) => {
      const assetName = a.name.toLowerCase();
      const assetSet = (a.set_name || "").toLowerCase();

      // Strict match if we have PSA data
      if (psaData) {
        if (assetName === cardNameLower &&
          assetSet === cardSetLower &&
          a.year === card.year &&
          a.psa_grade === card.estimatedGrade) {
          return true;
        }
      }

      // Fuzzy match fallback
      const firstWord = assetName.split(" ")[0];
      const isNameMatch = assetName.includes(cardNameLower) || cardNameLower.includes(assetName) || (firstWord.length > 3 && cardNameLower.includes(firstWord));
      const isSetMatch = assetSet.includes(cardSetLower) || cardSetLower.includes(assetSet);
      const isGradeMatch = a.psa_grade === card.estimatedGrade;
      const isYearMatch = a.year === card.year;

      return isNameMatch && isSetMatch && isGradeMatch && isYearMatch;
    });

    return NextResponse.json({
      card,
      matchedSymbol: matchedAsset?.symbol ?? null,
      imageUrl,
      rawImageUrl,
      pricing: null,
      validation: {
        isFullSlabVisible: card.isFullSlabVisible,
        isCleanBackground: card.isCleanBackground,
        isFillingScreen: card.isFillingScreen
      }
    });
  } catch (error) {
    console.error("Scan API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
