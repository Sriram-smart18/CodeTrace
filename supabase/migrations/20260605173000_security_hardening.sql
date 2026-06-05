-- Migration: TraceCode Security Hardening
-- Hardens RLS on ai_evaluations, activity_events, classrooms, and classroom_students.
-- Implements secure RPC function for classroom enrollment.

-- 1. Hardening ai_evaluations policies
DROP POLICY IF EXISTS "Teachers can view all evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Teachers can update evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Service can insert evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Students can view own evaluations when visible" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Secure select ai_evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Secure update ai_evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Secure insert ai_evaluations" ON public.ai_evaluations;

-- SELECT: Teachers/Admins can view if they created the assignment; students can view only when results_visible is true and own record
CREATE POLICY "Secure select ai_evaluations"
  ON public.ai_evaluations FOR SELECT TO authenticated
  USING (
    (student_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = ai_evaluations.assignment_id AND a.results_visible = true
    ))
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- UPDATE: Teachers can update if they created the assignment; Admins can update all
CREATE POLICY "Secure update ai_evaluations"
  ON public.ai_evaluations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- INSERT: Admins can insert (Service Role bypasses RLS for edge function inserts)
CREATE POLICY "Secure insert ai_evaluations"
  ON public.ai_evaluations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- 2. Hardening activity_events policies
DROP POLICY IF EXISTS "Teachers can view all events" ON public.activity_events;
DROP POLICY IF EXISTS "Secure select activity_events" ON public.activity_events;

-- SELECT: Students can view own events; Teachers can view events for assignments they created; Admins full access
CREATE POLICY "Secure select activity_events"
  ON public.activity_events FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );


-- 3. Secure Classroom Enrollment RPC & Policies
DROP POLICY IF EXISTS "Anyone can view classroom by code for joining" ON public.classrooms;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.classroom_students;

-- Security Definer RPC for student classroom enrollment
CREATE OR REPLACE FUNCTION public.join_classroom(p_classroom_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_classroom_id uuid;
  v_classroom_name text;
BEGIN
  -- Validate classroom exists and is active
  SELECT id, classroom_name INTO v_classroom_id, v_classroom_name 
  FROM public.classrooms 
  WHERE UPPER(classroom_code) = UPPER(TRIM(p_classroom_code)) 
    AND is_active = true;

  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive classroom code';
  END IF;

  -- Enroll authenticated caller
  INSERT INTO public.classroom_students (classroom_id, student_id)
  VALUES (v_classroom_id, auth.uid())
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  -- Return metadata
  RETURN json_build_object(
    'id', v_classroom_id,
    'classroom_name', v_classroom_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_classroom(text) TO authenticated;
