import { ExtractedSignals } from "../extraction/schemas";
import { EvaluationResult } from "./schemas";
import type { DealSegment } from "../enrichment/apollo";

export function crossCheckEvaluation(
  _signals: ExtractedSignals,
  evaluation: EvaluationResult,
  dealSegment: DealSegment = "mid_tier"
): { status: EvaluationResult["overall_status"]; mismatch: string | null } {
  const { budget, authority, need, timing } = evaluation.bant_scores;

  if (dealSegment === "enterprise") {
    // For enterprise, budget being low is expected — only flag if need + authority + timing are all low
    const coreLow = authority.score <= 2 && need.score <= 2 && timing.score <= 2;
    if (coreLow && evaluation.overall_status !== "Unqualified") {
      return {
        status: "Unqualified",
        mismatch: `Enterprise: authority, need, and timing all scored <= 2 but evaluator returned "${evaluation.overall_status}"`,
      };
    }
  } else {
    const allLow = budget.score <= 2 && authority.score <= 2 && need.score <= 2 && timing.score <= 2;
    if (allLow && evaluation.overall_status !== "Unqualified") {
      return {
        status: "Unqualified",
        mismatch: `All BANT dimensions scored <= 2 but evaluator returned "${evaluation.overall_status}"`,
      };
    }
  }

  return { status: evaluation.overall_status, mismatch: null };
}
