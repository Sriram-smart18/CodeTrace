-- Migration: 20260528021000_phase3_project_files.sql
-- Description: Create project_files tree structure table with helper access functions.

-- Helper function: verify if user owns a project
CREATE OR REPLACE FUNCTION public.user_owns_project(project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_id AND student_id = auth.uid()
  );
$$;

-- Helper function: verify if user can view/read a project
CREATE OR REPLACE FUNCTION public.user_can_view_project(project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_id 
    AND (
      student_id = auth.uid() OR 
      (classroom_id IS NOT NULL AND public.user_owns_classroom(classroom_id))
    )
  );
$$;

-- Create project files table
CREATE TABLE IF NOT EXISTS public.project_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('file', 'folder')),
    parent_id UUID REFERENCES public.project_files(id) ON DELETE CASCADE,
    content TEXT NULL,
    language TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for quick subfolder & file trees scans
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON public.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_parent_id ON public.project_files(parent_id);

-- Enable RLS
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

-- File RLS Policies
CREATE POLICY "Students can mutate project files they own" ON public.project_files
    FOR ALL
    TO authenticated
    USING (public.user_owns_project(project_id))
    WITH CHECK (public.user_owns_project(project_id));

CREATE POLICY "Authorized users can read project files" ON public.project_files
    FOR SELECT
    TO authenticated
    USING (public.user_can_view_project(project_id));
