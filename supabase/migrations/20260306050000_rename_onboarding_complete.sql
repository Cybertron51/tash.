-- Rename onboarding_complete to stripe_onboarding_complete
ALTER TABLE profiles RENAME COLUMN onboarding_complete TO stripe_onboarding_complete;
