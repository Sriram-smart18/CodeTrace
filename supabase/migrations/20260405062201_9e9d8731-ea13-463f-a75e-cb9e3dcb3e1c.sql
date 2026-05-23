
CREATE TABLE public.fraud_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL DEFAULT 'low',
  alert_type TEXT NOT NULL,
  explanation TEXT NOT NULL,
  event_summary JSONB,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view all fraud alerts"
  ON public.fraud_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Teachers can update fraud alerts"
  ON public.fraud_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Service can insert fraud alerts"
  ON public.fraud_alerts FOR INSERT TO authenticated
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.fraud_alerts;
