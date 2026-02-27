-- GEO Phrase Analysis: tables for customer language extraction and aggregation

-- Tracks each analysis run (daily extraction, weekly aggregation, or historical backfill)
CREATE TABLE geo_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL
    CHECK (type IN ('daily_extraction', 'weekly_analysis', 'backfill')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  calls_processed int NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-call LLM phrase extraction results
CREATE TABLE call_phrase_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES geo_analysis_runs(id) ON DELETE CASCADE,
  phrases_json jsonb NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, run_id)
);

CREATE INDEX idx_call_phrase_extractions_call ON call_phrase_extractions (call_id);
CREATE INDEX idx_call_phrase_extractions_run ON call_phrase_extractions (run_id);

-- Aggregated phrase rankings (produced by weekly analysis runs)
CREATE TABLE phrase_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES geo_analysis_runs(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  category text NOT NULL
    CHECK (category IN ('problem_descriptions', 'solution_seeking', 'pain_language', 'feature_mentions', 'search_intent')),
  frequency int NOT NULL DEFAULT 0,
  call_count int NOT NULL DEFAULT 0,
  cumulative_frequency int NOT NULL DEFAULT 0,
  cumulative_call_count int NOT NULL DEFAULT 0,
  example_contexts jsonb NOT NULL DEFAULT '[]',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_phrase_statistics_run ON phrase_statistics (run_id);
CREATE INDEX idx_phrase_statistics_category ON phrase_statistics (category);
CREATE INDEX idx_phrase_statistics_freq ON phrase_statistics (cumulative_frequency DESC);

-- Extend the jobs type constraint to include new job types
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check
  CHECK (type IN ('PROCESS_FATHOM_MEETING', 'REPROCESS_CALL', 'EXTRACT_GEO_PHRASES', 'RUN_GEO_WEEKLY_ANALYSIS'));

-- RLS policies (read-only for authenticated users, writes via service role)
ALTER TABLE geo_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_phrase_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE phrase_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read geo analysis runs"
  ON geo_analysis_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read call phrase extractions"
  ON call_phrase_extractions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read phrase statistics"
  ON phrase_statistics FOR SELECT TO authenticated USING (true);
