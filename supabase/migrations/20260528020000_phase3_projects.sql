-- Migration: 20260528020000_phase3_projects.sql
-- Description: Create projects table with tenant-isolated RLS and indexes.

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    student_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    classroom_id UUID REFERENCES public.classrooms(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ NULL
);

-- Optimize queries with indexes
CREATE INDEX IF NOT EXISTS idx_projects_student_id ON public.projects(student_id);
CREATE INDEX IF NOT EXISTS idx_projects_classroom_id ON public.projects(classroom_id);
CREATE INDEX IF NOT EXISTS idx_projects_assignment_id ON public.projects(assignment_id);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Policies for Projects
CREATE POLICY "Students can access their own projects" ON public.projects
    FOR ALL
    TO authenticated
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can read projects in their classrooms" ON public.projects
    FOR SELECT
    TO authenticated
    USING (
        classroom_id IS NOT NULL AND 
        public.user_owns_classroom(classroom_id)
    );
