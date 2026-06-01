-- Database migration: 20260528042000_phase5_monitoring.sql
-- Establishes the public.prune_telemetry_logs() function to maintain a lean database.

CREATE OR REPLACE FUNCTION public.prune_telemetry_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_activities INTEGER;
  deleted_sessions INTEGER;
BEGIN
  -- 1. Delete activity logs older than 30 days
  DELETE FROM public.activity_logs
  WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_activities = ROW_COUNT;

  -- 2. Delete monitoring sessions where last_heartbeat is older than 7 days
  DELETE FROM public.monitoring_sessions
  WHERE last_heartbeat < now() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  -- Log pruning event to activity_logs
  INSERT INTO public.activity_logs (user_id, event_type, details)
  SELECT 
    id, 
    'telemetry_pruned', 
    jsonb_build_object(
      'deleted_activities_count', deleted_activities,
      'deleted_monitoring_sessions_count', deleted_sessions,
      'pruned_at', now()
    )
  FROM public.profiles
  WHERE role = 'admin'
  LIMIT 1;
END;
$$;

-- Grant execution permission to authenticated users (e.g. admins)
GRANT EXECUTE ON FUNCTION public.prune_telemetry_logs() TO authenticated;
