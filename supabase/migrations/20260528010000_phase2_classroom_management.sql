-- ============================================================
-- TraceCode Phase 2 Migration: Classroom Management & RLS Helpers
-- ============================================================

-- 1. Upgrade classroom_students table with soft delete and statuses
ALTER TABLE public.classroom_students 
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enrollment_status TEXT NOT NULL DEFAULT 'active' CHECK (enrollment_status IN ('pending', 'active', 'removed', 'blocked')),
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Create index on foreign keys for high-performance joins
CREATE INDEX IF NOT EXISTS idx_classroom_students_status ON public.classroom_students(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_classroom_students_is_active ON public.classroom_students(is_active);

-- 3. SECURITY DEFINER helper function: user_owns_classroom
-- Checks if current auth user is the teacher who created the classroom
CREATE OR REPLACE FUNCTION public.user_owns_classroom(p_classroom_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classrooms
    WHERE id = p_classroom_id AND teacher_id = auth.uid()
  )
$$;

-- 4. SECURITY DEFINER helper function: user_enrolled_in_classroom
-- Checks if current auth user is actively enrolled in the classroom
CREATE OR REPLACE FUNCTION public.user_enrolled_in_classroom(p_classroom_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classroom_students
    WHERE classroom_id = p_classroom_id 
      AND student_id = auth.uid() 
      AND enrollment_status = 'active'
      AND is_active = true
      AND deleted_at IS NULL
  )
$$;

-- 5. Idempotent Policy Updates for classrooms
-- Drop old policies to prevent collision
DROP POLICY IF EXISTS "Teachers can view own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can create classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can update own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can delete own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Students can view enrolled classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Anyone can view classroom by code for joining" ON public.classrooms;

-- Define non-recursive secure policies
CREATE POLICY "Teachers can view own classrooms"
  ON public.classrooms FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can create classrooms"
  ON public.classrooms FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Teachers can update own classrooms"
  ON public.classrooms FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can delete own classrooms"
  ON public.classrooms FOR DELETE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can view enrolled classrooms"
  ON public.classrooms FOR SELECT TO authenticated
  USING (public.user_enrolled_in_classroom(id));

CREATE POLICY "Anyone can view classroom by code for joining"
  ON public.classrooms FOR SELECT TO authenticated
  USING (is_active = true);

-- 6. Idempotent Policy Updates for classroom_students
DROP POLICY IF EXISTS "Students can view own enrollments" ON public.classroom_students;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.classroom_students;
DROP POLICY IF EXISTS "Teachers can view classroom enrollments" ON public.classroom_students;
DROP POLICY IF EXISTS "Teachers can remove students" ON public.classroom_students;

CREATE POLICY "Students can view own enrollments"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.user_owns_classroom(classroom_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can enroll themselves"
  ON public.classroom_students FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND enrollment_status = 'active');

CREATE POLICY "Teachers can insert classroom enrollments"
  ON public.classroom_students FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_classroom(classroom_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can update classroom enrollments"
  ON public.classroom_students FOR UPDATE TO authenticated
  USING (public.user_owns_classroom(classroom_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can delete classroom enrollments"
  ON public.classroom_students FOR DELETE TO authenticated
  USING (public.user_owns_classroom(classroom_id) OR public.has_role(auth.uid(), 'admin'));
