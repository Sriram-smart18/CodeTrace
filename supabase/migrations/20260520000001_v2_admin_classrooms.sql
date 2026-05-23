-- ============================================================
-- TraceCode V2 Migration: Admin Role + Classroom System
-- ============================================================

-- 1. Add 'admin' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

-- 2. Add classroom_code to assignments (for direct assignment sharing)
--    and classroom_id foreign key (added after classrooms table)

-- 3. Create classrooms table
CREATE TABLE IF NOT EXISTS public.classrooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  classroom_name TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  classroom_code TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Create classroom_students (enrollment) table
CREATE TABLE IF NOT EXISTS public.classroom_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(classroom_id, student_id)
);

-- 5. Add classroom_id to assignments (nullable for backward compat)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'python';

-- 6. Add is_suspended to profiles for admin user management
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

-- 7. Enable RLS on new tables
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_students ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for classrooms
-- Teachers can view their own classrooms
CREATE POLICY "Teachers can view own classrooms"
  ON public.classrooms FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Teachers can create classrooms
CREATE POLICY "Teachers can create classrooms"
  ON public.classrooms FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'));

-- Teachers can update their own classrooms
CREATE POLICY "Teachers can update own classrooms"
  ON public.classrooms FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid());

-- Teachers can delete their own classrooms
CREATE POLICY "Teachers can delete own classrooms"
  ON public.classrooms FOR DELETE TO authenticated
  USING (teacher_id = auth.uid());

-- Students can view classrooms they are enrolled in
CREATE POLICY "Students can view enrolled classrooms"
  ON public.classrooms FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_students cs
      WHERE cs.classroom_id = classrooms.id AND cs.student_id = auth.uid()
    )
  );

-- Anyone authenticated can view a classroom by code (for joining)
CREATE POLICY "Anyone can view classroom by code for joining"
  ON public.classrooms FOR SELECT TO authenticated
  USING (true);

-- 9. RLS Policies for classroom_students
-- Students can view their own enrollments
CREATE POLICY "Students can view own enrollments"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

-- Students can enroll themselves
CREATE POLICY "Students can enroll themselves"
  ON public.classroom_students FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Teachers can view enrollments for their classrooms
CREATE POLICY "Teachers can view classroom enrollments"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_students.classroom_id AND c.teacher_id = auth.uid()
    )
  );

-- Teachers can remove students from their classrooms
CREATE POLICY "Teachers can remove students"
  ON public.classroom_students FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_students.classroom_id AND c.teacher_id = auth.uid()
    )
  );

-- 10. Update assignments RLS to scope by classroom ownership
-- Drop old broad policy and replace with classroom-scoped one
DROP POLICY IF EXISTS "All authenticated can view assignments" ON public.assignments;

-- Students can view assignments for classrooms they are enrolled in
CREATE POLICY "Students can view classroom assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (
    -- Legacy: no classroom_id (global assignments visible to all)
    classroom_id IS NULL
    OR
    -- Classroom-scoped: student must be enrolled
    EXISTS (
      SELECT 1 FROM public.classroom_students cs
      WHERE cs.classroom_id = assignments.classroom_id AND cs.student_id = auth.uid()
    )
    OR
    -- Teacher sees their own assignments
    created_by = auth.uid()
    OR
    -- Admin sees all
    public.has_role(auth.uid(), 'admin')
  );

-- Teachers can only create assignments for their own classrooms
DROP POLICY IF EXISTS "Teachers can create assignments" ON public.assignments;
CREATE POLICY "Teachers can create assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      classroom_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.classrooms c
        WHERE c.id = assignments.classroom_id AND c.teacher_id = auth.uid()
      )
    )
  );

-- Teachers can only update their own assignments
DROP POLICY IF EXISTS "Teachers can update assignments" ON public.assignments;
CREATE POLICY "Teachers can update own assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Teachers can only delete their own assignments
DROP POLICY IF EXISTS "Teachers can delete assignments" ON public.assignments;
CREATE POLICY "Teachers can delete own assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 11. Admin policies on profiles (admin can view/update all)
CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 12. Admin policies on submissions
CREATE POLICY "Admin can view all submissions"
  ON public.submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 13. Triggers for updated_at on new tables
CREATE TRIGGER update_classrooms_updated_at
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 14. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON public.classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_code ON public.classrooms(classroom_code);
CREATE INDEX IF NOT EXISTS idx_classroom_students_classroom ON public.classroom_students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_student ON public.classroom_students(student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_classroom ON public.assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON public.assignments(created_by);

-- 15. Enable realtime on classrooms
ALTER PUBLICATION supabase_realtime ADD TABLE public.classrooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classroom_students;
