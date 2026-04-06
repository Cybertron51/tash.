-- Correlated sector price ticks (runs well under pg_cron on Supabase).
-- Each invocation draws one shock per category (pokemon / sports / mtg / other), blends with
-- idiosyncratic noise, clamps to ±p_max_delta_pct, updates prices (price_history trigger fires).

CREATE OR REPLACE FUNCTION public.tick_market_prices(
  p_max_delta_pct numeric DEFAULT 0.2,
  p_sector_blend numeric DEFAULT 0.65
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
  rec record;
  v_shock_pokemon numeric;
  v_shock_sports numeric;
  v_shock_mtg numeric;
  v_shock_other numeric;
  v_old numeric;
  v_ref numeric;
  v_frac numeric;
  v_new numeric;
  v_maxf numeric;
BEGIN
  IF p_max_delta_pct IS NULL OR p_max_delta_pct <= 0 THEN
    RAISE EXCEPTION 'p_max_delta_pct must be > 0';
  END IF;
  IF p_sector_blend IS NULL OR p_sector_blend < 0 OR p_sector_blend > 1 THEN
    RAISE EXCEPTION 'p_sector_blend must be between 0 and 1';
  END IF;

  v_maxf := p_max_delta_pct / 100.0;
  v_shock_pokemon := (random() * 2 - 1) * v_maxf;
  v_shock_sports := (random() * 2 - 1) * v_maxf;
  v_shock_mtg := (random() * 2 - 1) * v_maxf;
  v_shock_other := (random() * 2 - 1) * v_maxf;

  FOR rec IN
    SELECT pr.card_id,
           pr.price::numeric AS price,
           pr.change_24h::numeric AS change_24h,
           pr.high_24h::numeric AS high_24h,
           pr.low_24h::numeric AS low_24h,
           c.category
    FROM public.prices pr
    INNER JOIN public.cards c ON c.id = pr.card_id
  LOOP
    v_old := rec.price;

    SELECT COALESCE(
      (
        SELECT ph.price::numeric
        FROM public.price_history ph
        WHERE ph.card_id = rec.card_id
          AND ph.recorded_at <= now() - interval '24 hours'
        ORDER BY ph.recorded_at DESC
        LIMIT 1
      ),
      v_old - COALESCE(rec.change_24h, 0)
    )
    INTO v_ref;

    IF v_ref <= 0 THEN
      v_ref := v_old;
    END IF;

    v_frac := CASE rec.category
      WHEN 'pokemon' THEN v_shock_pokemon
      WHEN 'sports' THEN v_shock_sports
      WHEN 'mtg' THEN v_shock_mtg
      ELSE v_shock_other
    END * p_sector_blend + (random() * 2 - 1) * v_maxf * (1 - p_sector_blend);

    v_frac := LEAST(v_maxf, GREATEST(-v_maxf, v_frac));
    v_new := round(GREATEST(0.01::numeric, v_old * (1 + v_frac)), 2);

    UPDATE public.prices
    SET
      price = v_new,
      change_24h = round(v_new - v_ref, 2),
      change_pct_24h = CASE
        WHEN v_ref > 0 THEN round(((v_new - v_ref) / v_ref) * 100::numeric, 4)
        ELSE 0
      END,
      high_24h = round(GREATEST(COALESCE(rec.high_24h, v_old), v_new, v_old), 2),
      low_24h = round(LEAST(COALESCE(rec.low_24h, v_old), v_new, v_old), 2),
      updated_at = now()
    WHERE card_id = rec.card_id;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.tick_market_prices(numeric, numeric) IS
  'Random walk with correlated sector shocks. p_sector_blend 1=all sector, 0=pure idiosyncratic. Schedule via pg_cron.';

REVOKE ALL ON FUNCTION public.tick_market_prices(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tick_market_prices(numeric, numeric) TO postgres;
GRANT EXECUTE ON FUNCTION public.tick_market_prices(numeric, numeric) TO service_role;

-- pg_cron: enable in Dashboard → Database → Extensions first, then run snippets/schedule_tick_market_prices.sql
-- or uncomment below if pg_cron is already available in your project.
--
-- SELECT cron.schedule(
--   'tick-market-prices',
--   '0 * * * *',
--   $$SELECT public.tick_market_prices(0.2::numeric, 0.65::numeric)$$
-- );
