-- Add 'disapproved' status to vault_holdings
-- 1. Drop and recreate the status CHECK constraint to include 'disapproved'
ALTER TABLE vault_holdings DROP CONSTRAINT IF EXISTS vault_holdings_status_check;
ALTER TABLE vault_holdings ADD CONSTRAINT vault_holdings_status_check
  CHECK (status IN (
    'pending_authentication',
    'shipped',
    'received',
    'authenticating',
    'tradable',
    'withdrawn',
    'listed',
    'returning',
    'disapproved'
  ));
