/**
 * Worker / server: second-pass AE deal brief (extra LLM + DB column).
 * When false/unset, behavior matches pre–deal-brief prod (no extra call, no deal_brief_json on insert).
 */
export function isDealBriefPipelineEnabled(): boolean {
  return process.env.DEAL_BRIEF_ENABLED === "true";
}
