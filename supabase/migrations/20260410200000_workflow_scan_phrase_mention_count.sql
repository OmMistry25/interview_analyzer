-- Per-call count of adjacent "workflow automation" / "workflow-automation" phrases (prospect speech).

ALTER TABLE workflow_automation_scan_hits
  ADD COLUMN IF NOT EXISTS phrase_mention_count int NOT NULL DEFAULT 1;

COMMENT ON COLUMN workflow_automation_scan_hits.phrase_mention_count IS
  'Non-overlapping matches of adjacent workflow+automation in joined prospect text for that call.';
