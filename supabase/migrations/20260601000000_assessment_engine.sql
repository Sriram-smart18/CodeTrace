-- ================================================================
-- TRACECODE ASSESSMENT ENGINE — SCHEMAS & POLICIES
-- ================================================================

-- 1. Create problems table
CREATE TABLE IF NOT EXISTS public.problems (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  problem_statement TEXT NOT NULL,
  constraints TEXT,
  sample_input TEXT,
  sample_output TEXT,
  time_limit INTEGER DEFAULT 5 NOT NULL, -- in seconds
  memory_limit INTEGER DEFAULT 256 NOT NULL, -- in MB
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Create test_cases table
CREATE TABLE IF NOT EXISTS public.test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  input TEXT,
  expected_output TEXT NOT NULL,
  is_hidden BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Create submission_test_results table
CREATE TABLE IF NOT EXISTS public.submission_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL,
  test_case_id UUID REFERENCES public.test_cases(id) ON DELETE CASCADE NOT NULL,
  passed BOOLEAN NOT NULL,
  execution_time INTEGER, -- in ms
  memory_used INTEGER -- in KB
);

-- 4. Add columns to assignments
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS max_submissions INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supported_languages TEXT[] DEFAULT NULL;

-- 5. Add columns to submissions
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'python',
  ADD COLUMN IF NOT EXISTS verdict TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS execution_time INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS memory_used INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_test_results ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies: problems
DROP POLICY IF EXISTS "SELECT problems" ON public.problems;
CREATE POLICY "SELECT problems" ON public.problems
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
      AND (
        a.classroom_id IS NULL
        OR a.created_by = auth.uid()
        OR public.user_enrolled_in_classroom(a.classroom_id)
        OR public.has_role(auth.uid(), 'admin')
      )
    )
  );

DROP POLICY IF EXISTS "ALL problems for teachers" ON public.problems;
CREATE POLICY "ALL problems for teachers" ON public.problems
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- 8. RLS Policies: test_cases
-- Hidden test cases are ONLY viewable by the teacher who created the assignment (or admin).
-- Students can only fetch non-hidden (public) test cases.
DROP POLICY IF EXISTS "SELECT test cases" ON public.test_cases;
CREATE POLICY "SELECT test cases" ON public.test_cases
  FOR SELECT TO authenticated
  USING (
    (
      NOT is_hidden
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.id = assignment_id
        AND (
          a.classroom_id IS NULL
          OR a.created_by = auth.uid()
          OR public.user_enrolled_in_classroom(a.classroom_id)
          OR public.has_role(auth.uid(), 'admin')
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

DROP POLICY IF EXISTS "ALL test cases for teachers" ON public.test_cases;
CREATE POLICY "ALL test cases for teachers" ON public.test_cases
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- 9. RLS Policies: submission_test_results
DROP POLICY IF EXISTS "SELECT submission test results" ON public.submission_test_results;
CREATE POLICY "SELECT submission test results" ON public.submission_test_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_id
      AND (s.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE s.id = submission_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- 10. Compile high-performance query indexes
CREATE INDEX IF NOT EXISTS idx_submissions_leaderboard 
  ON public.submissions(assignment_id, score DESC, execution_time ASC, submitted_at ASC);

CREATE INDEX IF NOT EXISTS idx_submissions_student_lookup
  ON public.submissions(student_id, assignment_id);

CREATE INDEX IF NOT EXISTS idx_test_cases_assignment 
  ON public.test_cases(assignment_id);

CREATE INDEX IF NOT EXISTS idx_problems_assignment 
  ON public.problems(assignment_id);

CREATE INDEX IF NOT EXISTS idx_submission_test_results_lookup
  ON public.submission_test_results(submission_id);

-- 11. Add tables to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'problems'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.problems;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'test_cases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.test_cases;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'submission_test_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.submission_test_results;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
  END IF;
END$$;

