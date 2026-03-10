-- Migration: Add Referral System
-- Date: 2026-03-09

CREATE TABLE IF NOT EXISTS referral_codes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT        UNIQUE NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for referral_codes
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read referral_codes" ON referral_codes;
CREATE POLICY "Public read referral_codes" ON referral_codes FOR SELECT USING (true);

-- Add referral_code_id to profiles
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='referral_code_id') THEN
    ALTER TABLE profiles ADD COLUMN referral_code_id UUID REFERENCES referral_codes(id);
  END IF;
END $$;

-- Update handle_new_user function to enforce referral codes
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  v_referral_code_id UUID;
  v_referral_code_text TEXT;
BEGIN
  -- Extract referral code from metadata
  v_referral_code_text := NEW.raw_user_meta_data->>'referral_code';
  
  -- Look up the referral code ID in public.referral_codes
  IF v_referral_code_text IS NOT NULL THEN
    SELECT id INTO v_referral_code_id FROM public.referral_codes WHERE code = v_referral_code_text;
  END IF;

  -- ENFORCE: Check if code is valid
  -- Special case for admin override
  IF NEW.email != 'derekyp9@gmail.com' THEN
    IF v_referral_code_id IS NULL THEN
      -- In Supabase Auth triggers, RAISE EXCEPTION is the only way to stop the signup
      -- and it will show up as a "Database error" in the frontend.
      RAISE EXCEPTION 'A valid referral code is required. [%]', COALESCE(v_referral_code_text, 'NULL');
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, name, cash_balance, locked_balance, referral_code_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    0.00,
    0.00,
    v_referral_code_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    referral_code_id = EXCLUDED.referral_code_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Catch-all for any other DB errors to avoid generic error if possible
  RAISE EXCEPTION 'Signup Failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert a default launch code
INSERT INTO referral_codes (code, description) VALUES ('LAUNCH2025', 'Initial Launch Code') ON CONFLICT (code) DO NOTHING;
