/**
 * Worker: second-pass AE deal brief (extra LLM + deal_brief_json on insert).
 * Default **on**. Set `DEAL_BRIEF_ENABLED=false` to disable (omits column from insert — works without migration).
 */
export function isDealBriefPipelineEnabled(): boolean {
  return process.env.DEAL_BRIEF_ENABLED !== "false";
}

/**
 * Second-pass Console use-case labels (LLM + `console_use_cases_json` on insert).
 * Default **off**. Set `CONSOLE_USE_CASES_ENABLED=true` to enable.
 */
export function isConsoleUseCasesPipelineEnabled(): boolean {
  return process.env.CONSOLE_USE_CASES_ENABLED === "true";
}
