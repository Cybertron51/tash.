-- Cap automated market ticks (random-walk updates) per card per UTC day so charts
-- get at most a few synthetic points per day. Trades still update `prices` freely;
-- `market_tick_*` columns are only advanced by `tick_market_prices`.

ALTER TABLE public.prices
  ADD COLUMN IF NOT EXISTS market_tick_day date,
  ADD COLUMN IF NOT EXISTS market_tick_count smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.prices.market_tick_day IS
  'UTC calendar date for which market_tick_count applies (scheduled ticks only).';
COMMENT ON COLUMN public.prices.market_tick_count IS
  'How many times tick_market_prices moved this card''s price on market_tick_day (UTC).';

-- Replace 2-arg version (Postgres treats different arity as different functions).
DROP FUNCTION IF EXISTS public.tick_market_prices(numeric, numeric);

CREATE OR REPLACE FUNCTION public.tick_market_prices(
  p_max_delta_pct numeric DEFAULT 0.2,
  p_sector_blend numeric DEFAULT 0.65,
  p_min_ticks_per_day integer DEFAULT 1,
  p_max_ticks_per_day integer DEFAULT 6
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
  v_day_utc date;
  v_target int;
  v_mcount int;
  v_span int;
BEGIN
  IF p_max_delta_pct IS NULL OR p_max_delta_pct <= 0 THEN
    RAISE EXCEPTION 'p_max_delta_pct must be > 0';
  END IF;
  IF p_sector_blend IS NULL OR p_sector_blend < 0 OR p_sector_blend > 1 THEN
    RAISE EXCEPTION 'p_sector_blend must be between 0 and 1';
  END IF;
  IF p_min_ticks_per_day IS NULL OR p_min_ticks_per_day < 1 THEN
    RAISE EXCEPTION 'p_min_ticks_per_day must be >= 1';
  END IF;
  IF p_max_ticks_per_day IS NULL OR p_max_ticks_per_day < p_min_ticks_per_day THEN
    RAISE EXCEPTION 'p_max_ticks_per_day must be >= p_min_ticks_per_day';
  END IF;
  IF p_max_ticks_per_day > 48 THEN
    RAISE EXCEPTION 'p_max_ticks_per_day must be <= 48';
  END IF;

  v_day_utc := (now() AT TIME ZONE 'UTC')::date;
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
           pr.market_tick_day,
           pr.market_tick_count,
           c.category
    FROM public.prices pr
    INNER JOIN public.cards c ON c.id = pr.card_id
  LOOP
    v_span := p_max_ticks_per_day - p_min_ticks_per_day + 1;
    v_target := p_min_ticks_per_day
      + mod(
          abs(hashtext(rec.card_id::text || '|' || v_day_utc::text)),
          v_span
        );

    IF rec.market_tick_day IS NULL OR rec.market_tick_day <> v_day_utc THEN
      v_mcount := 0;
    ELSE
      v_mcount := rec.market_tick_count::int;
    END IF;

    IF v_mcount >= v_target THEN
      CONTINUE;
    END IF;

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
      updated_at = now(),
      market_tick_day = v_day_utc,
      market_tick_count = v_mcount + 1
    WHERE card_id = rec.card_id;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.tick_market_prices(numeric, numeric, integer, integer) IS
  'Random walk with sector shocks. Each card gets p_min..p_max market ticks per UTC day (deterministic per card+day). Trades do not use the tick quota.';

REVOKE ALL ON FUNCTION public.tick_market_prices(numeric, numeric, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tick_market_prices(numeric, numeric, integer, integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.tick_market_prices(numeric, numeric, integer, integer) TO service_role;
