-- Batch scan: Qualified calls, prospect utterances where "workflow" + "automation" co-occur (lexical)

CREATE TABLE workflow_automation_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  qualified_call_count int NOT NULL DEFAULT 0,
  scanned_count int NOT NULL DEFAULT 0,
  hit_count int NOT NULL DEFAULT 0,
  scanner_version text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_automation_scan_runs_created ON workflow_automation_scan_runs (created_at DESC);

CREATE TABLE workflow_automation_scan_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_automation_scan_runs(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  snippets jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, call_id)
);

CREATE INDEX idx_workflow_automation_scan_hits_run ON workflow_automation_scan_hits (run_id);
CREATE INDEX idx_workflow_automation_scan_hits_call ON workflow_automation_scan_hits (call_id);

ALTER TABLE workflow_automation_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_automation_scan_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read workflow automation scan runs"
  ON workflow_automation_scan_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read workflow automation scan hits"
  ON workflow_automation_scan_hits FOR SELECT TO authenticated USING (true);
