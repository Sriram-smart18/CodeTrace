
-- Migration C: Store behavioral log snapshot on submissions at submit time
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS behavioral_log JSONB;
