-- Create assessment_results table
CREATE TABLE IF NOT EXISTS public.assessment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL UNIQUE,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  overall_score INTEGER NOT NULL,
  correctness_score INTEGER NOT NULL,
  quality_score INTEGER NOT NULL,
  plagiarism_score INTEGER NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  correctness_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  plagiarism_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "Students can select own assessment results" ON public.assessment_results;
CREATE POLICY "Students can select own assessment results" ON public.assessment_results
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can select assessment results for their assignments" ON public.assessment_results;
CREATE POLICY "Teachers can select assessment results for their assignments" ON public.assessment_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

DROP POLICY IF EXISTS "Admins have full access on assessment results" ON public.assessment_results;
CREATE POLICY "Admins have full access on assessment results" ON public.assessment_results
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_assessment_results_submission_id ON public.assessment_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_student_id ON public.assessment_results(student_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_assignment_id ON public.assessment_results(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_created_at ON public.assessment_results(created_at);

-- Register with Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'assessment_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assessment_results;
  END IF;
END$$;

-- Create update trigger for updated_at
DROP TRIGGER IF EXISTS update_assessment_results_updated_at ON public.assessment_results;
CREATE TRIGGER update_assessment_results_updated_at
  BEFORE UPDATE ON public.assessment_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
