-- Console use-case taxonomy output (JSON), independent of BANT / evaluation
ALTER TABLE extracted_signals ADD COLUMN IF NOT EXISTS console_use_cases_json jsonb;
