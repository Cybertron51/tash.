-- ============================================================
-- LEDGER — Seed Dummy Data
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- SEED AUTH USERS & PROFILES
-- Pre-generate known UUIDs for demo users
DO $$ 
DECLARE
  demo_uid UUID := '11111111-1111-1111-1111-111111111111';

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


  -- The trigger public.handle_new_user() will automatically create the public.profiles rows for these users.
  
  -- Update balances
  UPDATE public.profiles SET cash_balance = 50000.00 WHERE id = demo_uid;





END $$;

