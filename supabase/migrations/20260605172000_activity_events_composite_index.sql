-- Migration: Add composite index on activity_events(assignment_id, created_at DESC)
-- Optimize proctoring dashboard query: SELECT ... FROM activity_events WHERE assignment_id = $1 ORDER BY created_at DESC LIMIT 500

CREATE INDEX IF NOT EXISTS idx_activity_events_assignment_created 
ON public.activity_events(assignment_id, created_at DESC);
