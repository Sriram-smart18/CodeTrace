-- ============================================================
-- TraceCode Phase 2 Migration: Assignment Granular Permissions
-- ============================================================

-- 1. Create assignment_students (allocation) table
CREATE TABLE IF NOT EXISTS public.assignment_students (
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (assignment_id, student_id)
);

-- 2. Index allocations for optimization
CREATE INDEX IF NOT EXISTS idx_assignment_students_student ON public.assignment_students(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_students_assignment ON public.assignment_students(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_students_is_active ON public.assignment_students(is_active);

-- 3. SECURITY DEFINER helper function: user_has_assignment_permission
-- Checks if current auth user has permission to view/submit an assignment
CREATE OR REPLACE FUNCTION public.user_has_assignment_permission(p_assignment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_classroom_id UUID;
  v_created_by UUID;
  v_has_explicit_allocations BOOLEAN;
BEGIN
  -- Get classroom_id and creator for this assignment
  SELECT classroom_id, created_by INTO v_classroom_id, v_created_by FROM public.assignments WHERE id = p_assignment_id;

  -- Creator or admin always has permission
  IF v_created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') THEN
    RETURN TRUE;
  END IF;

  -- If student is not enrolled actively in classroom, no permission
  IF v_classroom_id IS NOT NULL AND NOT public.user_enrolled_in_classroom(v_classroom_id) THEN
    RETURN FALSE;
  END IF;

  -- Check if there are ANY explicit allocations for this assignment
  SELECT EXISTS (
    SELECT 1 FROM public.assignment_students 
    WHERE assignment_id = p_assignment_id AND is_active = true AND deleted_at IS NULL
  ) INTO v_has_explicit_allocations;

  IF v_has_explicit_allocations THEN
    -- If there are explicit student allocations, student must be explicitly in the list
    RETURN EXISTS (
      SELECT 1 FROM public.assignment_students
      WHERE assignment_id = p_assignment_id 
        AND student_id = auth.uid() 
        AND is_active = true 
        AND deleted_at IS NULL
    );
  ELSE
    -- If no explicit student allocations exist, everyone actively enrolled in classroom has access
    RETURN TRUE;
  END IF;
END;
$$;

-- 4. Enable RLS on assignment_students
ALTER TABLE public.assignment_students ENABLE ROW LEVEL SECURITY;

-- 5. Create secure RLS policies for assignment_students
DROP POLICY IF EXISTS "Students can view own allocations" ON public.assignment_students;
DROP POLICY IF EXISTS "Teachers can view classroom allocations" ON public.assignment_students;
DROP POLICY IF EXISTS "Teachers can create classroom allocations" ON public.assignment_students;
DROP POLICY IF EXISTS "Teachers can update classroom allocations" ON public.assignment_students;
DROP POLICY IF EXISTS "Teachers can delete classroom allocations" ON public.assignment_students;

CREATE POLICY "Students can view own allocations"
  ON public.assignment_students FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view classroom allocations"
  ON public.assignment_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Teachers can create classroom allocations"
  ON public.assignment_students FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Teachers can update classroom allocations"
  ON public.assignment_students FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Teachers can delete classroom allocations"
  ON public.assignment_students FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin')
  );

-- 6. Upgraded SECURE non-recursive policies for assignments
DROP POLICY IF EXISTS "Students can view classroom assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can create assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can update own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can delete own assignments" ON public.assignments;

CREATE POLICY "Secure view assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (public.user_has_assignment_permission(id));

CREATE POLICY "Secure create assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() 
    AND (
      classroom_id IS NULL 
      OR public.user_owns_classroom(classroom_id)
    )
  );

CREATE POLICY "Secure update own assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Secure delete own assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 7. Upgraded SECURE non-recursive policies for submissions
DROP POLICY IF EXISTS "Students can create submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students can view own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers can view all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admin can view all submissions" ON public.submissions;

CREATE POLICY "Secure insert submissions"
  ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid() 
    AND public.user_has_assignment_permission(assignment_id)
  );

CREATE POLICY "Secure select submissions"
  ON public.submissions FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Secure update submissions"
  ON public.submissions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- 8. Add Database Optimization Indexes (Production safety pass)
CREATE INDEX IF NOT EXISTS idx_assignments_classroom_id ON public.assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON public.assignments(created_by);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON public.submissions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_classroom_students_classroom_id ON public.classroom_students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_student_id ON public.classroom_students(student_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_created_at ON public.classroom_students(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);
