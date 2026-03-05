-- Add 'returning' status and shipping_address column to vault_holdings

-- 1. Drop and recreate the status CHECK constraint to include 'returning'
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
    'returning'
  ));

-- 2. Add shipping_address column for withdrawal return address
ALTER TABLE vault_holdings
ADD COLUMN IF NOT EXISTS shipping_address TEXT;
