-- Add dq_reason column to calls table
-- NULL means the call is not DQ'd (eligible for processing)
-- Non-null means the call was disqualified (e.g., "Not Stage 0")
ALTER TABLE calls ADD COLUMN IF NOT EXISTS dq_reason text;
