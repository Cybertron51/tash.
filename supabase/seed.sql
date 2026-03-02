-- ============================================================
-- LEDGER — Seed Dummy Data
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

INSERT INTO cards (symbol, name, category, set_name, year, psa_grade, image_url) VALUES 
('CHZ10-BASE-1999', 'Charizard Holo', 'pokemon', 'Base Set 1999', 1999, 10, '/cards/CHZ10-BASE-1999.svg'),
('PIKA10-ILLUS-1998', 'Pikachu Illustrator', 'pokemon', 'Promo 1998', 1998, 10, ''),
('BLS10-BASE-1999', 'Blastoise Holo', 'pokemon', 'Base Set 1999', 1999, 10, '/cards/BLS10-BASE-1999.svg'),
('LBJ10-TOP-2003', 'LeBron James RC', 'sports', 'Topps Chrome 2003', 2003, 10, '/cards/LBJ10-TOP-2003.svg'),
('MJ10-STAR-1986', 'Michael Jordan RC', 'sports', 'Fleer 1986', 1986, 10, ''),
('MEW10-CORO-1996', 'Mew Promo', 'pokemon', 'CoroCoro Promo 1996', 1996, 10, ''),
('PMH10-OPTIC-2017', 'Patrick Mahomes RC', 'sports', 'Donruss Optic 2017', 2017, 10, '/cards/PMH10-OPTIC-2017.svg'),
('SHO10-TOPPS-2018', 'Shohei Ohtani RC', 'sports', 'Topps Update 2018', 2018, 10, ''),
('RAY10-DS-2005', 'Rayquaza Gold Star', 'pokemon', 'Delta Species 2005', 2005, 9, '/cards/RAY10-DS-2005.svg'),
('TB12-BOWM-2000', 'Tom Brady RC', 'sports', 'Bowman Chrome 2000', 2000, 10, ''),
('UMB10-POP-2005', 'Umbreon Gold Star', 'pokemon', 'POP Series 5', 2005, 9, '/cards/UMB10-POP-2005.svg'),
('WEM10-PRIZM-2023', 'Wembanyama RC', 'sports', 'Prizm 2023', 2023, 10, '');

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 14250.00, +850.00, +6.34, 14500.00, 13200.00, 3 FROM cards WHERE symbol = 'CHZ10-BASE-1999';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 248000.00, -12500.00, -4.80, 260000.00, 245000.00, 1 FROM cards WHERE symbol = 'PIKA10-ILLUS-1998';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 3800.00, +210.00, +5.85, 3900.00, 3550.00, 5 FROM cards WHERE symbol = 'BLS10-BASE-1999';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 5650.00, +320.00, +6.01, 5800.00, 5200.00, 4 FROM cards WHERE symbol = 'LBJ10-TOP-2003';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 738000.00, +21000.00, +2.93, 750000.00, 710000.00, 1 FROM cards WHERE symbol = 'MJ10-STAR-1986';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 18400.00, -900.00, -4.67, 19500.00, 17800.00, 2 FROM cards WHERE symbol = 'MEW10-CORO-1996';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 2100.00, +155.00, +7.97, 2200.00, 1900.00, 8 FROM cards WHERE symbol = 'PMH10-OPTIC-2017';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 1450.00, -88.00, -5.72, 1580.00, 1400.00, 6 FROM cards WHERE symbol = 'SHO10-TOPPS-2018';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 42500.00, +3100.00, +7.87, 43000.00, 39000.00, 2 FROM cards WHERE symbol = 'RAY10-DS-2005';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 780000.00, +34000.00, +4.56, 790000.00, 740000.00, 1 FROM cards WHERE symbol = 'TB12-BOWM-2000';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 12800.00, -640.00, -4.76, 13500.00, 12500.00, 3 FROM cards WHERE symbol = 'UMB10-POP-2005';

INSERT INTO prices (card_id, price, change_24h, change_pct_24h, high_24h, low_24h, volume_24h)
SELECT id, 8900.00, +1200.00, +15.58, 9200.00, 7500.00, 12 FROM cards WHERE symbol = 'WEM10-PRIZM-2023';

-- SEED AUTH USERS & PROFILES
-- Pre-generate known UUIDs for demo users
DO $$ 
DECLARE
  demo_uid UUID := '11111111-1111-1111-1111-111111111111';
  alice_uid UUID := '22222222-2222-2222-2222-222222222222';
  bob_uid UUID := '33333333-3333-3333-3333-333333333333';
BEGIN
  -- Insert into auth.users (simulate a signed-up user)
  -- Password for this user: "demo123"
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change, phone, phone_change, phone_change_token)
  VALUES (
    demo_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo@tash.com',
    extensions.crypt('demo123', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Demo User"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    '',
    '',
    NULL,
    '',
    ''
  ) ON CONFLICT DO NOTHING;

  -- Collector Alice
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change, phone, phone_change, phone_change_token)
  VALUES (
    alice_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alice@tash.com',
    extensions.crypt('alice123', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Alice Collector"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    '',
    '',
    NULL,
    '',
    ''
  ) ON CONFLICT DO NOTHING;

  -- Collector Bob
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change, phone, phone_change, phone_change_token)
  VALUES (
    bob_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bob@tash.com',
    extensions.crypt('bob123', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Bob Trader"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    '',
    '',
    NULL,
    '',
    ''
  ) ON CONFLICT DO NOTHING;

  -- The trigger public.handle_new_user() will automatically create the public.profiles rows for these users.
  
  -- Update balances
  UPDATE public.profiles SET cash_balance = 50000.00 WHERE id = demo_uid;
  UPDATE public.profiles SET cash_balance = 35000.00 WHERE id = alice_uid;
  UPDATE public.profiles SET cash_balance = 15000.00 WHERE id = bob_uid;

  -- DEMO USER VAULT HOLDINGS
  INSERT INTO vault_holdings (user_id, card_id, symbol, status, acquisition_price, created_at, cert_number, image_url)
  SELECT demo_uid, id, symbol, 'tradable', 12400.00, '2024-03-15', 'PSA 47821930', '/cards/CHZ10-BASE-1999.svg' FROM cards WHERE symbol = 'CHZ10-BASE-1999';

  INSERT INTO vault_holdings (user_id, card_id, symbol, status, acquisition_price, created_at, cert_number, image_url)
  SELECT demo_uid, id, symbol, 'tradable', 4900.00, '2024-01-28', 'PSA 38847201', '/cards/LBJ10-TOP-2003.svg' FROM cards WHERE symbol = 'LBJ10-TOP-2003';

  INSERT INTO vault_holdings (user_id, card_id, symbol, status, acquisition_price, created_at, cert_number, image_url)
  SELECT demo_uid, id, symbol, 'shipped', 1820.00, '2024-07-11', 'PSA 61903854', '/cards/PMH10-OPTIC-2017.svg' FROM cards WHERE symbol = 'PMH10-OPTIC-2017';

  INSERT INTO vault_holdings (user_id, card_id, symbol, status, acquisition_price, created_at, cert_number, image_url)
  SELECT demo_uid, id, symbol, 'tradable', 37200.00, '2023-11-19', 'PSA 44512087', '/cards/RAY10-DS-2005.svg' FROM cards WHERE symbol = 'RAY10-DS-2005';

  INSERT INTO vault_holdings (user_id, card_id, symbol, status, acquisition_price, created_at, cert_number, image_url)
  SELECT demo_uid, id, symbol, 'tradable', 11100.00, '2024-02-07', 'PSA 49230561', '/cards/UMB10-POP-2005.svg' FROM cards WHERE symbol = 'UMB10-POP-2005';

  -- ALICE VAULT HOLDINGS (PRIMARY MARKET MAKER)
  INSERT INTO vault_holdings (user_id, card_id, symbol, status, acquisition_price, listing_price, created_at, cert_number, image_url)
  SELECT alice_uid, id, symbol, 'listed', 3200.00, 3800.00, '2024-05-02', 'PSA 52104773', '/cards/BLS10-BASE-1999.svg' FROM cards WHERE symbol = 'BLS10-BASE-1999';

  INSERT INTO vault_holdings (user_id, card_id, symbol, status, acquisition_price, listing_price, created_at, cert_number, image_url)
  SELECT alice_uid, id, symbol, 'listed', 5400.00, 5650.00, '2024-04-10', 'PSA 38840001', '/cards/LBJ10-TOP-2003.svg' FROM cards WHERE symbol = 'LBJ10-TOP-2003';

  -- BOB VAULT HOLDINGS (ADDITIONAL LIQUIDITY)
  INSERT INTO vault_holdings (user_id, card_id, symbol, status, acquisition_price, listing_price, created_at, cert_number, image_url)
  SELECT bob_uid, id, symbol, 'listed', 3600.00, 3800.00, '2024-06-21', 'PSA 60000001', '/cards/BLS10-BASE-1999.svg' FROM cards WHERE symbol = 'BLS10-BASE-1999';
END $$;

