-- Initial schema for Transcript Evaluator

-- Task 1.2: fathom_webhook_events
CREATE TABLE fathom_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id text UNIQUE NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false,
  raw_headers jsonb,
  raw_body jsonb,
  processing_status text NOT NULL DEFAULT 'queued'
    CHECK (processing_status IN ('queued', 'ignored', 'processed', 'error')),
  error text
);

-- Task 1.3: calls
CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'fathom',
  source_meeting_id text,
  source_recording_id text,
  title text NOT NULL,
  start_time timestamptz,
  end_time timestamptz,
  share_url text,
  fathom_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Task 1.4: participants
CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  role text NOT NULL DEFAULT 'unknown'
    CHECK (role IN ('ae', 'prospect', 'unknown')),
  source_label text
);

-- Task 1.5: utterances
CREATE TABLE utterances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  idx int NOT NULL,
  speaker_participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  speaker_label_raw text NOT NULL,
  timestamp_start_sec numeric,
  timestamp_end_sec numeric,
  text_raw text NOT NULL,
  text_normalized text NOT NULL
);

CREATE INDEX idx_utterances_call_order ON utterances (call_id, idx);

-- Task 1.6: jobs
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL
    CHECK (type IN ('PROCESS_FATHOM_MEETING', 'REPROCESS_CALL')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}',
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Task 1.7: processing_runs
CREATE TABLE processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rubric_version text NOT NULL,
  extractor_prompt_version text NOT NULL,
  evaluator_prompt_version text NOT NULL,
  model_extractor text NOT NULL,
  model_evaluator text NOT NULL,
  transcript_hash text,
  error text
);

-- Task 1.8: extracted_signals
CREATE TABLE extracted_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_run_id uuid NOT NULL REFERENCES processing_runs(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  signals_json jsonb NOT NULL,
  quality_checks jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Task 1.9: evaluations
CREATE TABLE evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_run_id uuid NOT NULL REFERENCES processing_runs(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  overall_status text NOT NULL
    CHECK (overall_status IN ('Qualified', 'Yellow', 'Disqualified', 'Needs Review')),
  score int NOT NULL,
  evaluation_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Task 1.10: RLS policies (read-only for authenticated users)
ALTER TABLE fathom_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE utterances ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read webhook events"
  ON fathom_webhook_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read calls"
  ON calls FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read participants"
  ON participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read utterances"
  ON utterances FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read jobs"
  ON jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read processing runs"
  ON processing_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read extracted signals"
  ON extracted_signals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read evaluations"
  ON evaluations FOR SELECT TO authenticated USING (true);
