-- Database migration: 20260528041000_phase5_ai_queue.sql
-- Sets up the evaluation_jobs queue table for resilient background AI and similarity checks.

CREATE TABLE IF NOT EXISTS public.evaluation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_logs TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Deduplication Constraint: Prevent duplicate concurrent pending/processing jobs per submission
CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_jobs_sub_active 
  ON public.evaluation_jobs(submission_id) 
  WHERE status IN ('pending', 'processing');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_evaluation_jobs_submission_id ON public.evaluation_jobs(submission_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_jobs_status ON public.evaluation_jobs(status);

-- Enable RLS
ALTER TABLE public.evaluation_jobs ENABLE ROW LEVEL SECURITY;

-- Select Policies
CREATE POLICY "Students can view own evaluation jobs"
  ON public.evaluation_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = evaluation_jobs.submission_id AND s.student_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can view their evaluation jobs"
  ON public.evaluation_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE s.id = evaluation_jobs.submission_id AND (a.created_by = auth.uid() OR public.user_owns_classroom(a.classroom_id))
    )
  );

CREATE POLICY "Admins can view all evaluation jobs"
  ON public.evaluation_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Insert Policies
CREATE POLICY "Students can insert own evaluation jobs"
  ON public.evaluation_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_id AND s.student_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can insert their evaluation jobs"
  ON public.evaluation_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE s.id = submission_id AND (a.created_by = auth.uid() OR public.user_owns_classroom(a.classroom_id))
    )
  );

CREATE POLICY "Admins can insert all evaluation jobs"
  ON public.evaluation_jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update Policies
CREATE POLICY "Students can update own evaluation jobs"
  ON public.evaluation_jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = evaluation_jobs.submission_id AND s.student_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = evaluation_jobs.submission_id AND s.student_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can update their evaluation jobs"
  ON public.evaluation_jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE s.id = evaluation_jobs.submission_id AND (a.created_by = auth.uid() OR public.user_owns_classroom(a.classroom_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      WHERE s.id = evaluation_jobs.submission_id AND (a.created_by = auth.uid() OR public.user_owns_classroom(a.classroom_id))
    )
  );

CREATE POLICY "Admins can update all evaluation jobs"
  ON public.evaluation_jobs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for update_at
DROP TRIGGER IF EXISTS update_evaluation_jobs_updated_at ON public.evaluation_jobs;
CREATE TRIGGER update_evaluation_jobs_updated_at
  BEFORE UPDATE ON public.evaluation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add evaluation_jobs to realtime publication if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'evaluation_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluation_jobs;
  END IF;
END$$;
