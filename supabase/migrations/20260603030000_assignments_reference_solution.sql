-- Add reference_solution to assignments table
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS reference_solution TEXT DEFAULT NULL;

-- Migrate existing reference solutions from problems to assignments
UPDATE public.assignments a
SET reference_solution = p.reference_solution
FROM public.problems p
WHERE p.assignment_id = a.id
  AND p.reference_solution IS NOT NULL;
