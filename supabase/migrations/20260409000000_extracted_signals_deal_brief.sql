-- AE-style second-pass brief (JSON), stored alongside BANT signals
ALTER TABLE extracted_signals ADD COLUMN IF NOT EXISTS deal_brief_json jsonb;
