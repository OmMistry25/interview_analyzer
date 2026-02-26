-- BANT Evaluation Overhaul
-- Replace old overall_status values with BANT-aligned statuses
-- Add stage_1_probability column for direct querying

-- Drop old CHECK constraint and add new one
ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_overall_status_check;
ALTER TABLE evaluations ADD CONSTRAINT evaluations_overall_status_check
  CHECK (overall_status IN ('Qualified', 'Needs Work', 'Unqualified'));

-- Add stage_1_probability as a top-level queryable column
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS stage_1_probability int;
