-- ============================================================
-- TraceCode Phase 4 Migration: IDE Session Monitoring
-- ============================================================

-- 1. Create monitoring_sessions table
CREATE TABLE IF NOT EXISTS public.monitoring_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'abnormal')),
  current_file TEXT DEFAULT NULL,
  language TEXT DEFAULT NULL,
  editor_focus BOOLEAN NOT NULL DEFAULT true,
  tab_switch_count INTEGER NOT NULL DEFAULT 0,
  copy_paste_count INTEGER NOT NULL DEFAULT 0,
  abnormal_typing_spikes INTEGER NOT NULL DEFAULT 0,
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, assignment_id)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.monitoring_sessions ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies: monitoring_sessions
DROP POLICY IF EXISTS "Students can insert their own sessions" ON public.monitoring_sessions;
DROP POLICY IF EXISTS "Students can update their own sessions" ON public.monitoring_sessions;
DROP POLICY IF EXISTS "Students can view their own sessions" ON public.monitoring_sessions;
DROP POLICY IF EXISTS "Teachers can view sessions in their classrooms" ON public.monitoring_sessions;
DROP POLICY IF EXISTS "Admins can manage all sessions" ON public.monitoring_sessions;

CREATE POLICY "Students can insert their own sessions"
  ON public.monitoring_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Students can update their own sessions"
  ON public.monitoring_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Students can view their own sessions"
  ON public.monitoring_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Teachers can view sessions in their classrooms"
  ON public.monitoring_sessions FOR SELECT TO authenticated
  USING (classroom_id IS NOT NULL AND public.user_owns_classroom(classroom_id));

CREATE POLICY "Admins can manage all sessions"
  ON public.monitoring_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
