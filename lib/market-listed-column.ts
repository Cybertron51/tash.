/**
 * `market_listed` was added in migration `20260403130000_add_cards_market_listed.sql`.
 * Before that migration runs, PostgREST errors on any filter/select involving the column.
 */
export function isMissingMarketListedColumn(err: { message?: string } | null | undefined): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("market_listed") &&
    (m.includes("does not exist") || m.includes("could not find"))
  );
}
