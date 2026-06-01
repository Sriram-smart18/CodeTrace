-- Migration: 20260528022000_phase3_editor_sessions.sql
-- Description: Create editor_sessions and terminal_sessions tables.

-- Create editor sessions table
CREATE TABLE IF NOT EXISTS public.editor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    active_file_id UUID REFERENCES public.project_files(id) ON DELETE SET NULL,
    open_tabs UUID[] NOT NULL DEFAULT '{}'::uuid[],
    layout_state JSONB NULL,
    cursor_positions JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, student_id)
);

-- Create terminal sessions table
CREATE TABLE IF NOT EXISTS public.terminal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    history_logs JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, student_id)
);

-- Indexing for session lookups
CREATE INDEX IF NOT EXISTS idx_editor_sessions_lookup ON public.editor_sessions(project_id, student_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_lookup ON public.terminal_sessions(project_id, student_id);

-- Enable RLS on both tables
ALTER TABLE public.editor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Editor Sessions
CREATE POLICY "Students can access their own editor sessions" ON public.editor_sessions
    FOR ALL
    TO authenticated
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Authorized readers can view editor sessions" ON public.editor_sessions
    FOR SELECT
    TO authenticated
    USING (public.user_can_view_project(project_id));

-- RLS Policies for Terminal Sessions
CREATE POLICY "Students can access their own terminal sessions" ON public.terminal_sessions
    FOR ALL
    TO authenticated
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Authorized readers can view terminal sessions" ON public.terminal_sessions
    FOR SELECT
    TO authenticated
    USING (public.user_can_view_project(project_id));
