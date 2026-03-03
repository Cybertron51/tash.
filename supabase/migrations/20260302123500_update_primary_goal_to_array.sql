ALTER TABLE public.profiles ALTER COLUMN primary_goal TYPE TEXT[] USING CASE WHEN primary_goal IS NULL THEN NULL ELSE ARRAY[primary_goal] END;
