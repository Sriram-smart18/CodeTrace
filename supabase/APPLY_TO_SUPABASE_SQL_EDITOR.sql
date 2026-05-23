-- ============================================================
-- TraceCode V3 — Complete Migration Script
-- 
-- HOW TO APPLY:
-- 1. Go to https://supabase.com/dashboard/project/uvuximrxlogvtgirtlsc
-- 2. Click "SQL Editor" in the left sidebar
-- 3. Click "New query"
-- 4. Paste this ENTIRE file
-- 5. Click "Run" (or press Ctrl+Enter)
--
-- This script is SAFE to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- ============================================================
-- BLOCK 1: Integrity fields on assignments (migration A)
-- ============================================================

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS difficulty TEXT
    DEFAULT 'Medium'
    CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  ADD COLUMN IF NOT EXISTS expected_skill_level TEXT
    DEFAULT 'Beginner'
    CHECK (expected_skill_level IN ('Beginner', 'Intermediate', 'Advanced'));

-- ============================================================
-- BLOCK 2: Integrity fields on ai_evaluations (migration B)
-- ============================================================

ALTER TABLE public.ai_evaluations
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS integrity_verdict TEXT,
  ADD COLUMN IF NOT EXISTS suspicious_segments JSONB,
  ADD COLUMN IF NOT EXISTS ai_indicators JSONB,
  ADD COLUMN IF NOT EXISTS plagiarism_indicators JSONB,
  ADD COLUMN IF NOT EXISTS faculty_review_recommended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS style_inconsistency_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paste_suspected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS complexity_jump_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS behavioral_log JSONB,
  ADD COLUMN IF NOT EXISTS peer_similarity_scores JSONB,
  ADD COLUMN IF NOT EXISTS highest_peer_similarity NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peer_ai_verdict TEXT;

-- ============================================================
-- BLOCK 3: Behavioral log on submissions (migration C)
-- ============================================================

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS behavioral_log JSONB;

-- ============================================================
-- BLOCK 4: Admin role + Classroom system (V2 migration)
-- ============================================================

-- 4a. Add 'admin' to the app_role enum
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction block in older PG.
-- Supabase SQL editor runs outside transactions so this is fine.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
END$$;

-- 4b. Create classrooms table
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

-- 4c. Create classroom_students enrollment table
CREATE TABLE IF NOT EXISTS public.classroom_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(classroom_id, student_id)
);

-- 4d. Add classroom_id and language to assignments
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'python';

-- 4e. Add is_suspended to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

-- 4f. Add total_marks and results_visible to assignments (if not already there)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS total_marks INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS results_visible BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- BLOCK 5: Enable RLS on new tables
-- ============================================================

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_students ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BLOCK 6: RLS Policies for classrooms
-- ============================================================

-- Drop existing policies first to avoid conflicts on re-run
DROP POLICY IF EXISTS "Teachers can view own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can create classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can update own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can delete own classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Students can view enrolled classrooms" ON public.classrooms;
DROP POLICY IF EXISTS "Anyone can view classroom by code for joining" ON public.classrooms;

-- Teachers and admin can view their classrooms
CREATE POLICY "Teachers can view own classrooms"
  ON public.classrooms FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Teachers can create classrooms
CREATE POLICY "Teachers can create classrooms"
  ON public.classrooms FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid());

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

-- Anyone authenticated can view any classroom (needed for join-by-code lookup)
CREATE POLICY "Anyone can view classroom by code for joining"
  ON public.classrooms FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- BLOCK 7: RLS Policies for classroom_students
-- ============================================================

DROP POLICY IF EXISTS "Students can view own enrollments" ON public.classroom_students;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.classroom_students;
DROP POLICY IF EXISTS "Teachers can view classroom enrollments" ON public.classroom_students;
DROP POLICY IF EXISTS "Teachers can remove students" ON public.classroom_students;

CREATE POLICY "Students can view own enrollments"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Students can enroll themselves"
  ON public.classroom_students FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can view classroom enrollments"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_students.classroom_id AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can remove students"
  ON public.classroom_students FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_students.classroom_id AND c.teacher_id = auth.uid()
    )
  );

-- ============================================================
-- BLOCK 8: Update assignments RLS for classroom isolation
-- ============================================================

DROP POLICY IF EXISTS "All authenticated can view assignments" ON public.assignments;
DROP POLICY IF EXISTS "Students can view classroom assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can create assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can update assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can delete assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can update own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can delete own assignments" ON public.assignments;

-- Students see assignments only for classrooms they joined (or legacy global ones)
CREATE POLICY "Students can view classroom assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (
    classroom_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.classroom_students cs
      WHERE cs.classroom_id = assignments.classroom_id AND cs.student_id = auth.uid()
    )
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Teachers create assignments for their own classrooms
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

CREATE POLICY "Teachers can update own assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can delete own assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- BLOCK 9: Admin policies on profiles and submissions
-- ============================================================

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all submissions" ON public.submissions;

CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view all submissions"
  ON public.submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- BLOCK 10: Trigger for classrooms updated_at
-- ============================================================

DROP TRIGGER IF EXISTS update_classrooms_updated_at ON public.classrooms;

CREATE TRIGGER update_classrooms_updated_at
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- BLOCK 11: Performance indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON public.classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_code ON public.classrooms(classroom_code);
CREATE INDEX IF NOT EXISTS idx_classroom_students_classroom ON public.classroom_students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_student ON public.classroom_students(student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_classroom ON public.assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON public.assignments(created_by);

-- ============================================================
-- BLOCK 12: Enable Realtime on new tables
-- ============================================================

DO $$
BEGIN
  -- Add classrooms to realtime publication if not already there
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'classrooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classrooms;
  END IF;

  -- Add classroom_students to realtime publication if not already there
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'classroom_students'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classroom_students;
  END IF;
END$$;

-- ============================================================
-- BLOCK 13: Update has_role function to support admin
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============================================================
-- BLOCK 14: Update handle_new_user trigger to support admin role
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, role, uid)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'student'),
    NEW.raw_user_meta_data->>'uid'
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'student')
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- VERIFICATION QUERY — Run this after to confirm success
-- ============================================================

SELECT 
  'classrooms' as table_name, COUNT(*) as row_count FROM public.classrooms
UNION ALL
SELECT 'classroom_students', COUNT(*) FROM public.classroom_students
UNION ALL
SELECT 'assignments', COUNT(*) FROM public.assignments
UNION ALL
SELECT 'profiles', COUNT(*) FROM public.profiles;
