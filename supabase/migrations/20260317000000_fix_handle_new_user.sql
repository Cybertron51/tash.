-- Fix handle_new_user trigger
--
-- The function in the live DB was an old manually-applied version with two bugs:
--   1. Queried `referral_codes` without `public.` prefix — fails in SECURITY DEFINER context
--   2. Blocked all signups without a referral code — enforcement belongs in the app, not the trigger

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  v_referral_code_id UUID;
  v_referral_code_text TEXT;
BEGIN
  v_referral_code_text := NEW.raw_user_meta_data->>'referral_code';

  IF v_referral_code_text IS NOT NULL THEN
    SELECT id INTO v_referral_code_id FROM public.referral_codes WHERE code = v_referral_code_text;
  END IF;

  -- Allow signup even without a referral code.
  -- The app's onboarding gate enforces referral_code_id must be set before proceeding.

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
    referral_code_id = COALESCE(EXCLUDED.referral_code_id, public.profiles.referral_code_id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Signup Failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
