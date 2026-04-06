-- Run in Supabase SQL Editor AFTER:
--   1. Database → Extensions → enable `pg_cron`
--   2. Migrations applied: tick_market_prices_sector + tick_market_daily_cap_per_card

-- One cron invocation every hour at :00 UTC; each card gets at most 1–6 *scheduled* price moves per UTC day (4th/5th args).
-- Trades always update `prices` and `price_history`. Tweak max move (0.2 = ±0.2%) and sector blend as needed.
-- If you already scheduled an older job, unschedule first (see bottom), then run schedule again.
SELECT cron.schedule(
  'tick-market-prices',
  '0 * * * *',
  $$SELECT public.tick_market_prices(0.2::numeric, 0.65::numeric, 1, 6)$$
);

-- List jobs: SELECT * FROM cron.job;
-- Remove:    SELECT cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'tick-market-prices'));
