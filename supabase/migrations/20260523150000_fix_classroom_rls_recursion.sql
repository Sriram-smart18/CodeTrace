-- Break classrooms <-> classroom_students RLS recursion (infinite recursion fix)
-- Project: fnvkthngkbrodsmjbuft

-- Security definer helpers bypass RLS when checking ownership/enrollment
CREATE OR REPLACE FUNCTION public.user_owns_classroom(_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classrooms c
    WHERE c.id = _classroom_id
      AND c.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_enrolled_in_classroom(_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_students cs
    WHERE cs.classroom_id = _classroom_id
      AND cs.student_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_classroom(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_enrolled_in_classroom(uuid) TO authenticated;

-- ============================================================
-- classrooms policies (non-recursive)
-- ============================================================

DROP POLICY IF EXISTS "Teachers can view their classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can view own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can create classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can update own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can update their classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can delete own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can delete their classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Students can view enrolled classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Anyone can view classroom by code for joining" ON public.classrooms;

CREATE POLICY "Teachers can view their classrooms"
  ON public.classrooms FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can create classrooms"
  ON public.classrooms FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update their classrooms"
  ON public.classrooms FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete their classrooms"
  ON public.classrooms FOR DELETE TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "Students can view enrolled classrooms"
  ON public.classrooms FOR SELECT TO authenticated
  USING (public.user_enrolled_in_classroom(id));

-- Join-by-code lookup (no subquery to classroom_students)
CREATE POLICY "Anyone can view classroom by code for joining"
  ON public.classrooms FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- classroom_students policies (non-recursive)
-- ============================================================

DROP POLICY IF EXISTS "Students can view own enrollments" ON public.classroom_students;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.classroom_students;
DROP POLICY IF EXISTS "Teachers can view classroom enrollments" ON public.classroom_students;
DROP POLICY IF EXISTS "Teachers can remove students" ON public.classroom_students;

CREATE POLICY "Students can view own enrollments"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view classroom enrollments"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (public.user_owns_classroom(classroom_id));

CREATE POLICY "Students can enroll themselves"
  ON public.classroom_students FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can remove students"
  ON public.classroom_students FOR DELETE TO authenticated
  USING (public.user_owns_classroom(classroom_id));

-- ============================================================
-- assignments policies (avoid classrooms/classroom_students loops)
-- ============================================================

DROP POLICY IF EXISTS "Students can view classroom assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can create assignments" ON public.assignments;

CREATE POLICY "Students can view classroom assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (
    classroom_id IS NULL
    OR created_by = auth.uid()
    OR public.user_enrolled_in_classroom(classroom_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Teachers can create assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      classroom_id IS NULL
      OR public.user_owns_classroom(classroom_id)
    )
  );
