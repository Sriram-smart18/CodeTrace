-- Database migration: 20260528040000_phase5_performance.sql
-- Optimizes query performance and eliminates sequential scans on common foreign keys and status queries.

-- Projects and Files Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON public.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_parent_id ON public.project_files(parent_id);
CREATE INDEX IF NOT EXISTS idx_projects_student_id ON public.projects(student_id);
CREATE INDEX IF NOT EXISTS idx_projects_assignment_id ON public.projects(assignment_id);

-- Classroom and Student Enrollment Indexes
CREATE INDEX IF NOT EXISTS idx_classroom_students_classroom_id ON public.classroom_students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_student_id ON public.classroom_students(student_id);

-- Submissions and AI Evaluation Indexes
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON public.submissions(submitted_at);

-- Editor and Terminal Sessions Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_editor_sessions_project_id ON public.editor_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_editor_sessions_student_id ON public.editor_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_editor_sessions_updated_at ON public.editor_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_project_id ON public.terminal_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_student_id ON public.terminal_sessions(student_id);

-- Realtime Notifications and Monitoring Audit Indexes
CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON public.notification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_read ON public.notification_events(read);
CREATE INDEX IF NOT EXISTS idx_notification_events_created_at ON public.notification_events(created_at);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_assignment_id ON public.monitoring_sessions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_student_id ON public.monitoring_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_created_at ON public.monitoring_sessions(created_at);
