-- ============================================================
-- TraceCode V3 — Complete Migration Script
-- 
-- HOW TO APPLY:
-- 1. Go to https://supabase.com/dashboard/project/fnvkthngkbrodsmjbuft
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
-- BLOCK 5b: RLS helper functions (prevents infinite recursion)
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_owns_classroom(_classroom_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classrooms c
    WHERE c.id = _classroom_id AND c.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_enrolled_in_classroom(_classroom_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classroom_students cs
    WHERE cs.classroom_id = _classroom_id AND cs.student_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_classroom(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_enrolled_in_classroom(uuid) TO authenticated;

-- ============================================================
-- BLOCK 6: RLS Policies for classrooms (non-recursive)
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

CREATE POLICY "Anyone can view classroom by code for joining"
  ON public.classrooms FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- BLOCK 7: RLS Policies for classroom_students (non-recursive)
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
-- BLOCK 15: Create assessment_results table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.assessment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL UNIQUE,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  overall_score INTEGER NOT NULL,
  correctness_score INTEGER NOT NULL,
  quality_score INTEGER NOT NULL,
  plagiarism_score INTEGER NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  correctness_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  plagiarism_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "Students can select own assessment results" ON public.assessment_results;
CREATE POLICY "Students can select own assessment results" ON public.assessment_results
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can select assessment results for their assignments" ON public.assessment_results;
CREATE POLICY "Teachers can select assessment results for their assignments" ON public.assessment_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

DROP POLICY IF EXISTS "Admins have full access on assessment results" ON public.assessment_results;
CREATE POLICY "Admins have full access on assessment results" ON public.assessment_results
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_assessment_results_submission_id ON public.assessment_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_student_id ON public.assessment_results(student_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_assignment_id ON public.assessment_results(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_created_at ON public.assessment_results(created_at);

-- Register with Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'assessment_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assessment_results;
  END IF;
END$$;

-- Create update trigger for updated_at
DROP TRIGGER IF EXISTS update_assessment_results_updated_at ON public.assessment_results;
CREATE TRIGGER update_assessment_results_updated_at
  BEFORE UPDATE ON public.assessment_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- BLOCK 16: Add reference_solution and performance indexes
-- ============================================================

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS reference_solution TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_problems_assignment_id ON public.problems(assignment_id);

-- ============================================================
-- BLOCK 17: Add reference_solution to assignments table
-- ============================================================

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS reference_solution TEXT DEFAULT NULL;

UPDATE public.assignments a
SET reference_solution = p.reference_solution
FROM public.problems p
WHERE p.assignment_id = a.id
  AND p.reference_solution IS NOT NULL;

-- ============================================================
-- BLOCK 18: Add composite index for activity_events performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_activity_events_assignment_created 
ON public.activity_events(assignment_id, created_at DESC);

-- ============================================================
-- BLOCK 19: Security Hardening Policies and join_classroom RPC
-- ============================================================

-- ai_evaluations policies
DROP POLICY IF EXISTS "Teachers can view all evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Teachers can update evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Service can insert evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Students can view own evaluations when visible" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Secure select ai_evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Secure update ai_evaluations" ON public.ai_evaluations;
DROP POLICY IF EXISTS "Secure insert ai_evaluations" ON public.ai_evaluations;

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

CREATE POLICY "Secure update ai_evaluations"
  ON public.ai_evaluations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id AND a.created_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Secure insert ai_evaluations"
  ON public.ai_evaluations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- activity_events policies
DROP POLICY IF EXISTS "Teachers can view all events" ON public.activity_events;
DROP POLICY IF EXISTS "Secure select activity_events" ON public.activity_events;

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

-- classrooms & classroom_students enrollment policies
DROP POLICY IF EXISTS "Anyone can view classroom by code for joining" ON public.classrooms;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.classroom_students;

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
  SELECT id, classroom_name INTO v_classroom_id, v_classroom_name 
  FROM public.classrooms 
  WHERE UPPER(classroom_code) = UPPER(TRIM(p_classroom_code)) 
    AND is_active = true;

  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive classroom code';
  END IF;

  INSERT INTO public.classroom_students (classroom_id, student_id)
  VALUES (v_classroom_id, auth.uid())
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  RETURN json_build_object(
    'id', v_classroom_id,
    'classroom_name', v_classroom_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_classroom(text) TO authenticated;

-- ============================================================
-- TraceCode V3 Database Migration: Admin User Management Security
-- ============================================================

-- 1. Add is_deleted column to public.profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- 2. Add database-level unique indexes to ensure at most one admin exists
CREATE UNIQUE INDEX IF NOT EXISTS only_one_admin_role
  ON public.user_roles (role)
  WHERE (role = 'admin');

CREATE UNIQUE INDEX IF NOT EXISTS only_one_admin_profile
  ON public.profiles (role)
  WHERE (role = 'admin');

-- 3. Update handle_new_user trigger function to block admin role escalation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  
  -- Force escalate any attempted 'admin' signup role to 'student'
  IF v_role = 'admin' THEN
    v_role := 'student';
  END IF;

  INSERT INTO public.profiles (user_id, name, email, role, uid)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    v_role,
    NEW.raw_user_meta_data->>'uid'
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    v_role
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Create trigger function to enforce administrator role and profile safeguards
CREATE OR REPLACE FUNCTION public.enforce_admin_security_profiles()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of admin profile
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      RAISE EXCEPTION 'Security Violation: The system administrator account cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- Block direct API creation of administrator profiles
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' THEN
      IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Security Violation: Direct API creation of administrator profile is prohibited.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Protect admin role and suspension status updates
  IF TG_OP = 'UPDATE' THEN
    -- Admin cannot be suspended
    IF OLD.role = 'admin' AND NEW.is_suspended = true THEN
      RAISE EXCEPTION 'Security Violation: The administrator account cannot be suspended.';
    END IF;

    -- Admin cannot be soft-deleted
    IF OLD.role = 'admin' AND NEW.is_deleted = true THEN
      RAISE EXCEPTION 'Security Violation: The administrator account cannot be deleted.';
    END IF;

    -- Admin role cannot be modified (no demotion)
    IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Security Violation: The administrator role cannot be modified.';
    END IF;

    -- Prevent escalating any user to admin
    IF NEW.role = 'admin' AND OLD.role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Security Violation: Cannot escalate to administrator role.';
    END IF;

    -- Prevent non-admin users from changing roles or suspension status
    IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted) THEN
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can modify roles or deactivation status.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Create trigger function to enforce user_roles safeguards
CREATE OR REPLACE FUNCTION public.enforce_admin_security_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of admin role
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      RAISE EXCEPTION 'Security Violation: The system administrator role cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- Prevent inserting admin role through APIs
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' THEN
      IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Security Violation: Direct API creation of administrator role is prohibited.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Prevent updating admin role mapping
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'admin' OR NEW.role = 'admin' THEN
      RAISE EXCEPTION 'Security Violation: Administrator role modifications are not allowed.';
    END IF;
    
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify roles.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Attach triggers to tables
DROP TRIGGER IF EXISTS protect_profiles_admin ON public.profiles;
CREATE TRIGGER protect_profiles_admin
  BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_security_profiles();

DROP TRIGGER IF EXISTS protect_roles_admin ON public.user_roles;
CREATE TRIGGER protect_roles_admin
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_security_roles();

-- 7. Update RLS policies to handle is_deleted filter automatically
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id AND is_deleted = false);

DROP POLICY IF EXISTS "Teachers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Teachers can view active profiles" ON public.profiles;
CREATE POLICY "Teachers can view active profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'teacher') AND is_deleted = false);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id AND is_deleted = false);

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
CREATE POLICY "Admin can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- 8. Add trigger to sync profiles role changes to user_roles automatically
CREATE OR REPLACE FUNCTION public.sync_profile_role_to_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE public.user_roles
    SET role = NEW.role
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_profile_role_to_user_roles_trg ON public.profiles;
CREATE TRIGGER sync_profile_role_to_user_roles_trg
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_to_user_roles();

-- ============================================================
-- BLOCK 20: Submissions Deduplication and Uniqueness Constraint
-- ============================================================

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

-- ============================================================================
-- VERIFICATION QUERY — Run this after to confirm success
-- ============================================================

SELECT 
  'classrooms' as table_name, COUNT(*) as row_count FROM public.classrooms
UNION ALL
SELECT 'classroom_students', COUNT(*) FROM public.classroom_students
UNION ALL
SELECT 'assignments', COUNT(*) FROM public.assignments
UNION ALL
SELECT 'profiles', COUNT(*) FROM public.profiles
UNION ALL
SELECT 'assessment_results', COUNT(*) FROM public.assessment_results;

