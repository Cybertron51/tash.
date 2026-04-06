/**
 * Single place for catalog `category` from PSA-like text (Subject/Player, CardSet, Brand).
 * Order: Pokémon → Magic → sports signals → other (never default to pokemon here).
 */
export type CardCategory = "pokemon" | "sports" | "mtg" | "other";

export function deriveCardCategory(subject: string, cardSet: string, brand: string): CardCategory {
  const s = subject.toLowerCase();
  const cs = cardSet.toLowerCase();
  const b = brand.toLowerCase();

  if (s.includes("pokemon") || cs.includes("pokemon") || b.includes("pokemon")) return "pokemon";

  if (
    s.includes("magic: the gathering") ||
    s.includes("magic the gathering") ||
    /\bmagic\b/.test(s) ||
    cs.includes("magic") ||
    s.includes("mtg") ||
    cs.includes("mtg") ||
    b.includes("wizards")
  ) {
    return "mtg";
  }

  const sportsNeedle = [
    "nfl",
    "nba",
    "wnba",
    "mlb",
    "nhl",
    "mls",
    "fifa",
    "ufc",
    "basketball",
    "football",
    "baseball",
    "hockey",
    "soccer",
    "panini",
    "topps",
    "upper deck",
    "bowman",
    "fleer",
    "donruss",
    "leaf cards",
    "sage collectibles",
    "onit athlete",
    "prizm",
    "mosaic",
    "contenders",
    "national treasures",
  ];

  for (const kw of sportsNeedle) {
    if (s.includes(kw) || cs.includes(kw) || b.includes(kw)) return "sports";
  }

  return "other";
}
