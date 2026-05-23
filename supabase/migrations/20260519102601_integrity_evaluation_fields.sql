
-- Migration B: Expand ai_evaluations with full integrity analysis fields
ALTER TABLE public.ai_evaluations
  -- Integrity classification
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS integrity_verdict TEXT,
  -- Suspicious code segments: [{ code: string, reason: string }]
  ADD COLUMN IF NOT EXISTS suspicious_segments JSONB,
  -- Signal arrays
  ADD COLUMN IF NOT EXISTS ai_indicators JSONB,
  ADD COLUMN IF NOT EXISTS plagiarism_indicators JSONB,
  -- Boolean detection flags
  ADD COLUMN IF NOT EXISTS faculty_review_recommended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS style_inconsistency_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paste_suspected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS complexity_jump_detected BOOLEAN DEFAULT false,
  -- Behavioral summary snapshot (mirrors what is stored on submissions)
  ADD COLUMN IF NOT EXISTS behavioral_log JSONB,
  -- Cross-submission peer similarity
  -- [{ student_id: string, similarity_score: number, method: string }]
  ADD COLUMN IF NOT EXISTS peer_similarity_scores JSONB,
  ADD COLUMN IF NOT EXISTS highest_peer_similarity NUMERIC(5,2) DEFAULT 0,
  -- AI verdict generated when peer similarity >= threshold
  ADD COLUMN IF NOT EXISTS peer_ai_verdict TEXT;
