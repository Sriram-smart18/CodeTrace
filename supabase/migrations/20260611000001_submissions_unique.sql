-- Clean up duplicate submissions, retaining only the latest submitted_at per assignment_id and student_id
DELETE FROM public.submissions s1
WHERE s1.id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY assignment_id, student_id 
      ORDER BY submitted_at DESC, updated_at DESC, id DESC
    ) as rn
    FROM public.submissions
  ) t
  WHERE t.rn > 1
);

-- Add unique constraint on public.submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'submissions_assignment_id_student_id_key'
  ) THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT submissions_assignment_id_student_id_key UNIQUE (assignment_id, student_id);
  END IF;
END$$;
