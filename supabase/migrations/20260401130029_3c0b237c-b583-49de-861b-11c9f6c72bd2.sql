
DROP POLICY "Service can insert evaluations" ON public.ai_evaluations;
CREATE POLICY "Authenticated can insert own evaluations"
  ON public.ai_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());
