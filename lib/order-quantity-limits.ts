import type { OrderBook } from "@/lib/market-data";
import type { VaultHolding } from "@/lib/vault-data";

/** Total units offered for sale (open sell orders), summed across price levels. */
export function listedSupplyFromOrderBook(book: OrderBook | null | undefined): number {
  if (!book?.asks?.length) return 0;
  return book.asks.reduce((sum, row) => sum + (Number(row.size) || 0), 0);
}

/** How many vault cards the user can list/sell (tradable, matching symbol). */
export function tradableInventoryCount(holdings: VaultHolding[], symbol: string): number {
  return holdings.filter((h) => h.symbol === symbol && h.status === "tradable").length;
}
