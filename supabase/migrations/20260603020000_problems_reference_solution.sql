-- Add reference_solution to problems table
ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS reference_solution TEXT DEFAULT NULL;

-- Create high performance indexing
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_problems_assignment_id ON public.problems(assignment_id);
