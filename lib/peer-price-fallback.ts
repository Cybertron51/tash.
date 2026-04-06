/**
 * When `prices.price` is missing or zero, synthesize a stable catalog anchor
 * near peer cards (same category + PSA grade) so UI and charts stay coherent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PeerPricedCard = {
  id: string;
  category: string;
  psa_grade: number;
  price: number;
  change_24h?: number;
  change_pct_24h?: number;
  high_24h?: number | null;
  low_24h?: number | null;
};

export function medianPositive(values: number[]): number | null {
  const v = values.filter((x) => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

function peerKey(category: string, psa_grade: number): string {
  return `${category || "other"}:${psa_grade}`;
}

/** Deterministic multiplier in ~[0.88, 1.12] from card id. */
export function peerJitterMultiplier(cardId: string): number {
  let h = 2166136261;
  for (let i = 0; i < cardId.length; i++) {
    h ^= cardId.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return 0.88 + ((h >>> 0) / 0xffff_ffff) * 0.24;
}

export function synthesizePeerPrice(cardId: string, base: number): number {
  const mult = peerJitterMultiplier(cardId);
  const p = Math.round(Math.max(0.01, Math.min(500_000, base * mult)) * 100) / 100;
  return p;
}

/** In-memory patch for API list responses. */
export function applyPeerPriceFallback<T extends PeerPricedCard>(cards: T[]): T[] {
  if (cards.length === 0) return cards;

  const globalMed =
    medianPositive(cards.map((c) => c.price)) ?? 25;

  const byPeer = new Map<string, number[]>();
  for (const c of cards) {
    if (c.price > 0) {
      const k = peerKey(String(c.category ?? "other"), Number(c.psa_grade));
      const arr = byPeer.get(k) ?? [];
      arr.push(c.price);
      byPeer.set(k, arr);
    }
  }
  const medians = new Map<string, number>();
  for (const [k, arr] of byPeer) {
    const m = medianPositive(arr);
    if (m != null) medians.set(k, m);
  }

  return cards.map((c) => {
    if (c.price > 0) return c;
    const k = peerKey(String(c.category ?? "other"), Number(c.psa_grade));
    const base = medians.get(k) ?? globalMed;
    const p = synthesizePeerPrice(c.id, base);
    return {
      ...c,
      price: p,
      change_24h: 0,
      change_pct_24h: 0,
      high_24h: p,
      low_24h: p,
    };
  });
}

/**
 * For batch jobs: map of card_id → effective anchor when DB price is ≤ 0.
 * Uses only cards/prices already in this batch (same request).
 */
export function fillZeroAnchorsFromBatchPeers<
  T extends { id: string; category: string; psa_grade: number },
>(batchCards: T[], priceByCard: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const globalMed =
    medianPositive([...priceByCard.values()]) ?? 25;

  const byPeer = new Map<string, number[]>();
  for (const c of batchCards) {
    const p = priceByCard.get(c.id) ?? 0;
    if (p > 0) {
      const k = peerKey(String(c.category ?? "other"), Number(c.psa_grade));
      const arr = byPeer.get(k) ?? [];
      arr.push(p);
      byPeer.set(k, arr);
    }
  }
  const medians = new Map<string, number>();
  for (const [k, arr] of byPeer) {
    const m = medianPositive(arr);
    if (m != null) medians.set(k, m);
  }

  for (const c of batchCards) {
    const p = priceByCard.get(c.id) ?? 0;
    if (p > 0) continue;
    const k = peerKey(String(c.category ?? "other"), Number(c.psa_grade));
    const base = medians.get(k) ?? globalMed;
    out.set(c.id, synthesizePeerPrice(c.id, base));
  }
  return out;
}

/** DB-backed peer median for a single card (detail chart / fallback anchor). */
export async function fetchPeerMedianFromDb(
  admin: SupabaseClient,
  category: string,
  psaGrade: number,
  excludeCardId: string
): Promise<number | null> {
  const { data } = await admin
    .from("cards")
    .select("id, prices(price)")
    .eq("category", category)
    .eq("psa_grade", psaGrade)
    .neq("id", excludeCardId)
    .limit(400);

  const prices: number[] = [];
  for (const row of data ?? []) {
    const pr = row.prices as { price?: unknown } | { price?: unknown }[] | null | undefined;
    const cell = Array.isArray(pr) ? pr[0] : pr;
    const n = Number(
      cell && typeof cell === "object" && cell !== null && "price" in cell
        ? (cell as { price: unknown }).price
        : NaN
    );
    if (n > 0 && Number.isFinite(n)) prices.push(n);
  }
  return medianPositive(prices);
}
