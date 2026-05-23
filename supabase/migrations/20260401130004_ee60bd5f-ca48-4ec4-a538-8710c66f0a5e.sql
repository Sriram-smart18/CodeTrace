
-- Add total_marks to assignments
ALTER TABLE public.assignments ADD COLUMN total_marks integer NOT NULL DEFAULT 100;

-- Add results_visible to assignments (teacher controls when students can see AI results)
ALTER TABLE public.assignments ADD COLUMN results_visible boolean NOT NULL DEFAULT false;

-- Create AI evaluations table
CREATE TABLE public.ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  correctness_score integer,
  code_quality_score integer,
  plagiarism_score integer,
  ai_probability_score integer,
  total_score integer,
  feedback text,
  detailed_report jsonb,
  evaluated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(submission_id)
);

ALTER TABLE public.ai_evaluations ENABLE ROW LEVEL SECURITY;

-- Teachers can view all evaluations
CREATE POLICY "Teachers can view all evaluations"
  ON public.ai_evaluations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'));

-- Students can view own evaluations (only when results_visible is true on assignment)
CREATE POLICY "Students can view own evaluations when visible"
  ON public.ai_evaluations FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = ai_evaluations.assignment_id
      AND a.results_visible = true
    )
  );

-- System/edge function can insert evaluations (via service role)
CREATE POLICY "Service can insert evaluations"
  ON public.ai_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Teachers can update evaluations
CREATE POLICY "Teachers can update evaluations"
  ON public.ai_evaluations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'));
