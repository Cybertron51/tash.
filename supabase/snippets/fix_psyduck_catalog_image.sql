-- After deploying the file public/cards/psyduck-2019-pokemon-old-maid-psa10.png, run this in Supabase SQL Editor.
-- Uses same-origin paths (works on localhost and your deployed domain).
-- If you prefer absolute URLs, replace with: 'https://YOUR_DOMAIN/cards/psyduck-2019-pokemon-old-maid-psa10.png'

UPDATE cards
SET
  image_url    = '/cards/psyduck-2019-pokemon-old-maid-psa10.png',
  image_url_hi = '/cards/psyduck-2019-pokemon-old-maid-psa10.png',
  market_listed = true
WHERE category = 'pokemon'
  AND name ILIKE '%psyduck%'
  AND set_name ILIKE '%old maid%'
  AND psa_grade = 10;

-- If zero rows updated, inspect and match by id:
-- SELECT id, symbol, name, set_name, psa_grade, image_url, market_listed FROM cards WHERE name ILIKE '%psyduck%';
