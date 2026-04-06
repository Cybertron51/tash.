import type { AssetData } from "@/lib/market-data";
import type { VaultHolding } from "@/lib/vault-data";

/**
 * Ordered fallbacks for vault row thumbnails. Prefer user HTTPS uploads, then catalog art,
 * then relative vault paths, then static SVG (often missing for arbitrary symbols).
 */
export function holdingImageCandidates(holding: VaultHolding, assets: AssetData[]): string[] {
  const catalog = holding.cardId
    ? assets.find((a) => a.id === holding.cardId)
    : assets.find((a) => a.symbol === holding.symbol);

  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string | null) => {
    const s = u?.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    ordered.push(s);
  };

  const vaultUrl = holding.imageUrl?.trim();
  const isVaultHttp = vaultUrl?.startsWith("http://") || vaultUrl?.startsWith("https://");

  if (isVaultHttp) push(vaultUrl);
  push(catalog?.imageUrl);
  if (vaultUrl && !isVaultHttp) push(vaultUrl);
  push(`/cards/${holding.symbol}.svg`);
  push(holding.rawImageUrl);

  return ordered;
}

/** Match legacy placeholder: first ~3 printable chars of the name (e.g. HAK, FA/) */
export function holdingNamePlaceholder(holding: VaultHolding): string {
  const t = holding.name.trim();
  if (!t) return "?";
  return t.slice(0, 3).toUpperCase();
}
