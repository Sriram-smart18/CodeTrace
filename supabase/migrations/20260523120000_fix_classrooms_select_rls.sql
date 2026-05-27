-- Fix classrooms SELECT (and ensure INSERT) RLS for teachers
-- Run in Supabase SQL Editor if not using supabase db push

DROP POLICY IF EXISTS "Teachers can view their classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can view own classrooms" ON public.classrooms;

CREATE POLICY "Teachers can view their classrooms"
  ON public.classrooms
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can create classrooms" ON public.classrooms;

CREATE POLICY "Teachers can create classrooms"
  ON public.classrooms
  FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = auth.uid());
