-- Listing gate: hide a catalog row from browse/search/public card APIs without deleting it
-- (preserves FKs: prices, trades, vault_holdings.card_id).

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS market_listed BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN cards.market_listed IS 'When false, card is omitted from public market/browse/search APIs.';

-- Delist Psyduck Pokémon Old Maid (bad catalog image); tighten scope in SQL if you have multiple Psyduck rows.
UPDATE cards
SET market_listed = false
WHERE category = 'pokemon'
  AND name ILIKE '%psyduck%'
  AND set_name ILIKE '%old maid%';
