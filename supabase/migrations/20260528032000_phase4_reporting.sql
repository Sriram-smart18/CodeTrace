-- ============================================================
-- TraceCode Phase 4 Migration: Reporting & Notifications Upgrade
-- ============================================================

-- 1. Create notification_events table
CREATE TABLE IF NOT EXISTS public.notification_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies: notification_events
DROP POLICY IF EXISTS "Users can view own notification events" ON public.notification_events;
DROP POLICY IF EXISTS "Users can update own notification events" ON public.notification_events;
DROP POLICY IF EXISTS "Anyone can insert notification events" ON public.notification_events;
DROP POLICY IF EXISTS "Admins can view all notification events" ON public.notification_events;

CREATE POLICY "Users can view own notification events"
  ON public.notification_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notification events"
  ON public.notification_events FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can insert notification events"
  ON public.notification_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view all notification events"
  ON public.notification_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Multi-Tenant Indexes for sub-millisecond execution queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_classroom_id ON public.activity_logs(classroom_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_assignment_id ON public.activity_logs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type ON public.activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_classroom_id ON public.analytics_snapshots(classroom_id);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_student_id ON public.analytics_snapshots(student_id);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_created_at ON public.analytics_snapshots(created_at);

CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_user_id ON public.monitoring_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_classroom_id ON public.monitoring_sessions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_assignment_id ON public.monitoring_sessions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_created_at ON public.monitoring_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON public.notification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_classroom_id ON public.notification_events(classroom_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_event_type ON public.notification_events(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_events_created_at ON public.notification_events(created_at);

-- 5. Enable real-time updates on all analytics & monitoring tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'analytics_snapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_snapshots;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'monitoring_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.monitoring_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notification_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_events;
  END IF;
END $$;
