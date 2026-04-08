/**
 * Worker: second-pass AE deal brief (extra LLM + deal_brief_json on insert).
 * Default **on**. Set `DEAL_BRIEF_ENABLED=false` to disable (omits column from insert — works without migration).
 */
export function isDealBriefPipelineEnabled(): boolean {
  return process.env.DEAL_BRIEF_ENABLED !== "false";
}
