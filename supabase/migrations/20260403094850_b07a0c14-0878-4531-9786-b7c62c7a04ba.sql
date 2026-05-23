CREATE TABLE public.activity_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['typing'::text, 'run'::text, 'submit'::text, 'paste'::text, 'focus'::text, 'blur'::text])),
  code_snapshot text,
  language text DEFAULT 'javascript',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert own events"
  ON public.activity_events FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can view all events"
  ON public.activity_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;

CREATE INDEX idx_activity_events_student ON public.activity_events(student_id);
CREATE INDEX idx_activity_events_created ON public.activity_events(created_at DESC);