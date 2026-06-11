-- ================================================================
-- TRACECODE V3 — COMPLETE SAFE MIGRATION
-- ================================================================
-- Project : fnvkthngkbrodsmjbuft (TraceCode)
-- Date    : 2026-05-20
-- Author  : Generated from verified DB audit
--
-- PRE-MIGRATION AUDIT RESULTS (verified via REST API):
--   TABLES EXIST    : assignments, submissions, profiles,
--                     ai_evaluations, activity_events,
--                     fraud_alerts, user_roles
--   TABLES MISSING  : classrooms, classroom_students
--   COLUMNS MISSING : see each phase below
--
-- SAFETY GUARANTEES:
--   ✓ Every DDL uses IF NOT EXISTS or OR REPLACE
--   ✓ DROP POLICY IF EXISTS before every CREATE POLICY
--   ✓ No tables are dropped
--   ✓ No existing data is modified
--   ✓ No auth tables are touched
--   ✓ Idempotent — safe to run multiple times
--
-- HOW TO APPLY:
--   1. Go to https://supabase.com/dashboard/project/fnvkthngkbrodsmjbuft/sql/new
--   2. Paste this ENTIRE file
--   3. Click RUN (Ctrl+Enter)
--   4. Scroll to bottom — verify all rows show "OK"
-- ================================================================


-- ================================================================
-- PHASE 1 — Extend app_role enum with 'admin'
-- ================================================================
-- CONFIRMED MISSING: admin value not in enum
-- Uses DO block because ALTER TYPE ADD VALUE cannot run in a
-- transaction, but Supabase SQL Editor runs outside transactions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_enum e
    JOIN   pg_type t ON e.enumtypid = t.oid
    WHERE  t.typname = 'app_role'
    AND    e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
    RAISE NOTICE 'Phase 1: Added admin to app_role enum ✓';
  ELSE
    RAISE NOTICE 'Phase 1: admin already in app_role enum — skipped';
  END IF;
END$$;


-- ================================================================
-- PHASE 2 — Add missing columns to existing tables
-- ================================================================
-- All use ADD COLUMN IF NOT EXISTS — zero risk to existing data.

-- 2a. assignments: integrity + classroom fields
-- CONFIRMED MISSING: difficulty, expected_skill_level, classroom_id, language
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS difficulty TEXT
    DEFAULT 'Medium'
    CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  ADD COLUMN IF NOT EXISTS expected_skill_level TEXT
    DEFAULT 'Beginner'
    CHECK (expected_skill_level IN ('Beginner', 'Intermediate', 'Advanced'));

-- classroom_id added AFTER classrooms table is created (Phase 3)
-- language added here since it has no FK dependency
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'python';

-- 2b. profiles: admin suspension flag
-- CONFIRMED MISSING: is_suspended
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

-- 2c. submissions: behavioral log snapshot
-- CONFIRMED MISSING: behavioral_log
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS behavioral_log JSONB;

-- 2d. ai_evaluations: full integrity analysis fields (13 columns)
-- CONFIRMED MISSING: all 13 listed below
ALTER TABLE public.ai_evaluations
  ADD COLUMN IF NOT EXISTS risk_level                   TEXT    DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS integrity_verdict            TEXT,
  ADD COLUMN IF NOT EXISTS suspicious_segments          JSONB,
  ADD COLUMN IF NOT EXISTS ai_indicators                JSONB,
  ADD COLUMN IF NOT EXISTS plagiarism_indicators        JSONB,
  ADD COLUMN IF NOT EXISTS faculty_review_recommended   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS style_inconsistency_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paste_suspected              BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS complexity_jump_detected     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS behavioral_log               JSONB,
  ADD COLUMN IF NOT EXISTS peer_similarity_scores       JSONB,
  ADD COLUMN IF NOT EXISTS highest_peer_similarity      NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peer_ai_verdict              TEXT;


-- ================================================================
-- PHASE 3 — Create classrooms table
-- ================================================================
-- CONFIRMED MISSING: entire table

CREATE TABLE IF NOT EXISTS public.classrooms (
  id             UUID     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id     UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  classroom_name TEXT     NOT NULL,
  subject_name   TEXT     NOT NULL,
  classroom_code TEXT     NOT NULL UNIQUE,
  description    TEXT,
  is_active      BOOLEAN  NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ================================================================
-- PHASE 4 — Create classroom_students enrollment table
-- ================================================================
-- CONFIRMED MISSING: entire table

CREATE TABLE IF NOT EXISTS public.classroom_students (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, student_id)
);


-- ================================================================
-- PHASE 5 — Add classroom_id FK to assignments
-- ================================================================
-- Done AFTER classrooms table exists so FK is valid

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS classroom_id UUID
    REFERENCES public.classrooms(id) ON DELETE CASCADE;


-- ================================================================
-- PHASE 6 — Enable RLS on new tables
-- ================================================================

ALTER TABLE public.classrooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_students ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- PHASE 6b — RLS helper functions (prevents infinite recursion)
-- ================================================================

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


-- ================================================================
-- PHASE 7 — RLS policies: classrooms (non-recursive)
-- ================================================================

DROP POLICY IF EXISTS "Teachers can view their classrooms"            ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can view own classrooms"              ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can create classrooms"                ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can update own classrooms"            ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can update their classrooms"          ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can delete own classrooms"            ON public.classrooms;
DROP POLICY IF EXISTS "Teachers can delete their classrooms"          ON public.classrooms;
DROP POLICY IF EXISTS "Students can view enrolled classrooms"         ON public.classrooms;
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


-- ================================================================
-- PHASE 8 — RLS policies: classroom_students (non-recursive)
-- ================================================================

DROP POLICY IF EXISTS "Students can view own enrollments"       ON public.classroom_students;
DROP POLICY IF EXISTS "Students can enroll themselves"          ON public.classroom_students;
DROP POLICY IF EXISTS "Teachers can view classroom enrollments" ON public.classroom_students;
DROP POLICY IF EXISTS "Teachers can remove students"            ON public.classroom_students;

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


-- ================================================================
-- PHASE 9 — Update assignments RLS for classroom isolation
-- ================================================================
-- Replace the old global "all authenticated can view" policy
-- with a classroom-scoped one.

DROP POLICY IF EXISTS "All authenticated can view assignments"  ON public.assignments;
DROP POLICY IF EXISTS "Students can view classroom assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can create assignments"         ON public.assignments;
DROP POLICY IF EXISTS "Teachers can update assignments"         ON public.assignments;
DROP POLICY IF EXISTS "Teachers can delete assignments"         ON public.assignments;
DROP POLICY IF EXISTS "Teachers can update own assignments"     ON public.assignments;
DROP POLICY IF EXISTS "Teachers can delete own assignments"     ON public.assignments;

-- Students see assignments only for classrooms they joined.
-- Legacy assignments (classroom_id IS NULL) remain visible to all
-- authenticated users for backward compatibility.
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

-- Teachers update only their own assignments
CREATE POLICY "Teachers can update own assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Teachers delete only their own assignments
CREATE POLICY "Teachers can delete own assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );


-- ================================================================
-- PHASE 10 — Admin RLS policies on profiles and submissions
-- ================================================================

DROP POLICY IF EXISTS "Admin can view all profiles"    ON public.profiles;
DROP POLICY IF EXISTS "Admin can update all profiles"  ON public.profiles;
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


-- ================================================================
-- PHASE 11 — updated_at trigger for classrooms
-- ================================================================

DROP TRIGGER IF EXISTS update_classrooms_updated_at ON public.classrooms;

CREATE TRIGGER update_classrooms_updated_at
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ================================================================
-- PHASE 12 — Performance indexes
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher
  ON public.classrooms(teacher_id);

CREATE INDEX IF NOT EXISTS idx_classrooms_code
  ON public.classrooms(classroom_code);

CREATE INDEX IF NOT EXISTS idx_classroom_students_classroom
  ON public.classroom_students(classroom_id);

CREATE INDEX IF NOT EXISTS idx_classroom_students_student
  ON public.classroom_students(student_id);

CREATE INDEX IF NOT EXISTS idx_assignments_classroom
  ON public.assignments(classroom_id);

CREATE INDEX IF NOT EXISTS idx_assignments_created_by
  ON public.assignments(created_by);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment
  ON public.submissions(assignment_id);

CREATE INDEX IF NOT EXISTS idx_ai_evaluations_assignment
  ON public.ai_evaluations(assignment_id);

CREATE INDEX IF NOT EXISTS idx_activity_events_assignment_created
  ON public.activity_events(assignment_id, created_at DESC);


-- ================================================================
-- PHASE 13 — Realtime publications for new tables
-- ================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'classrooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classrooms;
    RAISE NOTICE 'Phase 13: classrooms added to realtime ✓';
  ELSE
    RAISE NOTICE 'Phase 13: classrooms already in realtime — skipped';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'classroom_students'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classroom_students;
    RAISE NOTICE 'Phase 13: classroom_students added to realtime ✓';
  ELSE
    RAISE NOTICE 'Phase 13: classroom_students already in realtime — skipped';
  END IF;
END$$;


-- ================================================================
-- PHASE 14 — Update has_role() to handle admin value
-- ================================================================
-- OR REPLACE is safe — same logic, just ensures admin works

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role    = _role
  )
$$;


-- ================================================================
-- PHASE 15 — Update handle_new_user() trigger function
-- ================================================================
-- Adds ON CONFLICT DO NOTHING to prevent duplicate errors
-- when admin accounts are created manually.

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


-- ================================================================
-- PHASE 15.5 — Security Hardening Policies and join_classroom RPC
-- ================================================================

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

  -- Check if already enrolled to avoid unnecessary exception throwing
  IF EXISTS (
    SELECT 1 FROM public.classroom_students 
    WHERE classroom_id = v_classroom_id AND student_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are already enrolled in this classroom.';
  END IF;

  -- Enroll authenticated caller with exception handling for race conditions
  BEGIN
    INSERT INTO public.classroom_students (classroom_id, student_id)
    VALUES (v_classroom_id, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You are already enrolled in this classroom.';
  END;

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


-- ================================================================
-- PHASE 16 — VERIFICATION QUERY
-- ================================================================
-- Run this after the migration.
-- Every row should show status = 'OK'.
-- Any 'MISSING' row means that phase failed — re-run the file.

SELECT
  check_name,
  CASE WHEN result THEN '✓ OK' ELSE '✗ MISSING' END AS status
FROM (

  -- ── Tables ──────────────────────────────────────────────────
  SELECT 'TABLE: classrooms' AS check_name,
    EXISTS(SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name   = 'classrooms') AS result

  UNION ALL SELECT 'TABLE: classroom_students',
    EXISTS(SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name   = 'classroom_students')

  -- ── assignments columns ──────────────────────────────────────
  UNION ALL SELECT 'COL: assignments.classroom_id',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'assignments'
             AND column_name  = 'classroom_id')

  UNION ALL SELECT 'COL: assignments.language',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'assignments'
             AND column_name  = 'language')

  UNION ALL SELECT 'COL: assignments.difficulty',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'assignments'
             AND column_name  = 'difficulty')

  UNION ALL SELECT 'COL: assignments.expected_skill_level',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'assignments'
             AND column_name  = 'expected_skill_level')

  -- ── profiles columns ─────────────────────────────────────────
  UNION ALL SELECT 'COL: profiles.is_suspended',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'profiles'
             AND column_name  = 'is_suspended')

  -- ── submissions columns ──────────────────────────────────────
  UNION ALL SELECT 'COL: submissions.behavioral_log',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'submissions'
             AND column_name  = 'behavioral_log')

  -- ── ai_evaluations columns ───────────────────────────────────
  UNION ALL SELECT 'COL: ai_evaluations.risk_level',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'risk_level')

  UNION ALL SELECT 'COL: ai_evaluations.integrity_verdict',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'integrity_verdict')

  UNION ALL SELECT 'COL: ai_evaluations.suspicious_segments',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'suspicious_segments')

  UNION ALL SELECT 'COL: ai_evaluations.ai_indicators',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'ai_indicators')

  UNION ALL SELECT 'COL: ai_evaluations.plagiarism_indicators',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'plagiarism_indicators')

  UNION ALL SELECT 'COL: ai_evaluations.faculty_review_recommended',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'faculty_review_recommended')

  UNION ALL SELECT 'COL: ai_evaluations.style_inconsistency_detected',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'style_inconsistency_detected')

  UNION ALL SELECT 'COL: ai_evaluations.paste_suspected',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'paste_suspected')

  UNION ALL SELECT 'COL: ai_evaluations.complexity_jump_detected',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'complexity_jump_detected')

  UNION ALL SELECT 'COL: ai_evaluations.behavioral_log',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'behavioral_log')

  UNION ALL SELECT 'COL: ai_evaluations.peer_similarity_scores',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'peer_similarity_scores')

  UNION ALL SELECT 'COL: ai_evaluations.highest_peer_similarity',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'highest_peer_similarity')

  UNION ALL SELECT 'COL: ai_evaluations.peer_ai_verdict',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ai_evaluations'
             AND column_name  = 'peer_ai_verdict')

  -- ── Enum ─────────────────────────────────────────────────────
  UNION ALL SELECT 'ENUM: app_role contains admin',
    EXISTS(
      SELECT 1 FROM pg_enum e
      JOIN   pg_type t ON e.enumtypid = t.oid
      WHERE  t.typname   = 'app_role'
        AND  e.enumlabel = 'admin'
    )

  -- ── RLS policies ─────────────────────────────────────────────
  UNION ALL SELECT 'RLS: classrooms has policies',
    EXISTS(SELECT 1 FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'classrooms')

  UNION ALL SELECT 'RLS: classroom_students has policies',
    EXISTS(SELECT 1 FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'classroom_students')

  UNION ALL SELECT 'RLS: assignments classroom-scoped SELECT',
    EXISTS(SELECT 1 FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename  = 'assignments'
             AND policyname = 'Students can view classroom assignments')

  UNION ALL SELECT 'RLS: profiles admin policy',
    EXISTS(SELECT 1 FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename  = 'profiles'
             AND policyname = 'Admin can view all profiles')

  -- ── Indexes ──────────────────────────────────────────────────
  UNION ALL SELECT 'INDEX: idx_classrooms_teacher',
    EXISTS(SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname  = 'idx_classrooms_teacher')

  UNION ALL SELECT 'INDEX: idx_classrooms_code',
    EXISTS(SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname  = 'idx_classrooms_code')

  UNION ALL SELECT 'INDEX: idx_classroom_students_classroom',
    EXISTS(SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname  = 'idx_classroom_students_classroom')

  UNION ALL SELECT 'INDEX: idx_assignments_classroom',
    EXISTS(SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname  = 'idx_assignments_classroom')

  UNION ALL SELECT 'INDEX: idx_activity_events_assignment_created',
    EXISTS(SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname  = 'idx_activity_events_assignment_created')

  -- ── Trigger ──────────────────────────────────────────────────
  UNION ALL SELECT 'TRIGGER: classrooms updated_at',
    EXISTS(SELECT 1 FROM information_schema.triggers
           WHERE trigger_schema = 'public'
             AND event_object_table = 'classrooms'
             AND trigger_name = 'update_classrooms_updated_at')

  -- ── Admin Security Triggers & Columns ────────────────────────
  UNION ALL SELECT 'COL: profiles.is_deleted',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'profiles'
             AND column_name  = 'is_deleted')

  UNION ALL SELECT 'INDEX: only_one_admin_role',
    EXISTS(SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = 'only_one_admin_role')

  UNION ALL SELECT 'INDEX: only_one_admin_profile',
    EXISTS(SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = 'only_one_admin_profile')

  UNION ALL SELECT 'TRIGGER: profiles protect_profiles_admin',
    EXISTS(SELECT 1 FROM information_schema.triggers
           WHERE trigger_schema = 'public'
             AND event_object_table = 'profiles'
             AND trigger_name = 'protect_profiles_admin')

  UNION ALL SELECT 'TRIGGER: user_roles protect_roles_admin',
    EXISTS(SELECT 1 FROM information_schema.triggers
           WHERE trigger_schema = 'public'
             AND event_object_table = 'user_roles'
             AND trigger_name = 'protect_roles_admin')

) checks
ORDER BY status DESC, check_name;
