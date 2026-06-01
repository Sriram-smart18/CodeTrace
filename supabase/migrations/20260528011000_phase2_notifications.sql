-- ============================================================
-- TraceCode Phase 2 Migration: Notifications persistent system
-- ============================================================

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('student_joined', 'student_left', 'assignment_submitted', 'fraud_detected', 'announcement', 'assignment_assigned', 'assignment_due')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 2. Create index bindings for optimization
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_active ON public.notifications(is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);

-- 3. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. Create secure RLS policies (idempotent)
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND is_active = true AND deleted_at IS NULL);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Permit service roles or triggers to insert notifications
CREATE POLICY "Anyone can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- 5. Enable real-time updates on notifications table
-- Check if table is in publication, if not, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
