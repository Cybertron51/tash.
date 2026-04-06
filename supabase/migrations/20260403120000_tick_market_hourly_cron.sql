-- Move market price tick from every 10 minutes to every hour (UTC, at minute :00).
-- No-op if pg_cron extension or job is missing.

DO $$
DECLARE
  j record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'tick-market-prices'
    LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;
  END IF;
END $$;

SELECT cron.schedule(
  'tick-market-prices',
  '0 * * * *',
  $$SELECT public.tick_market_prices(0.2::numeric, 0.65::numeric, 1, 6)$$
)
WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');
