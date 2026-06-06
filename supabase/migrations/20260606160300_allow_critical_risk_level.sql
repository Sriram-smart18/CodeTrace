-- Alter assessment_results table to support CRITICAL risk level
ALTER TABLE public.assessment_results DROP CONSTRAINT IF EXISTS assessment_results_risk_level_check;
ALTER TABLE public.assessment_results ADD CONSTRAINT assessment_results_risk_level_check CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
