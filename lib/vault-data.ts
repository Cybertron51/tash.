/**
 * TASH — Vault Holdings Data
 *
 * Static mock data for the authenticated user's vault.
 * `currentValue` is NOT stored here — it is derived live
 * from the ASSETS price array in lib/market-data.ts.
 */

export interface VaultHolding {
  id: string;
  name: string;
  symbol: string;       // matches AssetData.symbol in lib/market-data.ts
  grade: number;        // 8, 9, or 10
  set: string;
  year: number;
  acquisitionPrice: number;
  status: "pending_authentication" | "shipped" | "received" | "authenticating" | "tradable" | "in_transit" | "withdrawn" | "listed" | "returning";
  dateDeposited: string; // ISO date string
  certNumber: string;    // mock PSA cert number
  imageUrl?: string;
  rawImageUrl?: string;
  listingPrice?: number;
  shippingAddress?: string;
}



