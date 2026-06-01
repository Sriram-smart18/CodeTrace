-- ============================================================
-- TraceCode Phase 4 Migration: Analytics Infrastructure
-- ============================================================

-- 1. Create activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Create analytics_snapshots table
CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('classroom_weekly', 'student_daily', 'platform_daily')),
  metrics JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: activity_logs
DROP POLICY IF EXISTS "Students can insert their own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Students can view their own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Teachers can view activity logs for their classrooms" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins can view all activity logs" ON public.activity_logs;

CREATE POLICY "Students can insert their own activity logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Students can view their own activity logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Teachers can view activity logs for their classrooms"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (classroom_id IS NOT NULL AND public.user_owns_classroom(classroom_id));

CREATE POLICY "Admins can view all activity logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. RLS Policies: analytics_snapshots
DROP POLICY IF EXISTS "Students can view their own snapshots" ON public.analytics_snapshots;
DROP POLICY IF EXISTS "Teachers can view snapshots for their classrooms" ON public.analytics_snapshots;
DROP POLICY IF EXISTS "Admins can manage all snapshots" ON public.analytics_snapshots;

CREATE POLICY "Students can view their own snapshots"
  ON public.analytics_snapshots FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view snapshots for their classrooms"
  ON public.analytics_snapshots FOR SELECT TO authenticated
  USING (classroom_id IS NOT NULL AND public.user_owns_classroom(classroom_id));

CREATE POLICY "Admins can manage all snapshots"
  ON public.analytics_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
