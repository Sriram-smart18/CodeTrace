
-- Migration A: Add difficulty and expected_skill_level to assignments table
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS difficulty TEXT
    DEFAULT 'Medium'
    CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  ADD COLUMN IF NOT EXISTS expected_skill_level TEXT
    DEFAULT 'Beginner'
    CHECK (expected_skill_level IN ('Beginner', 'Intermediate', 'Advanced'));
