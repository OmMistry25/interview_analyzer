import { ExtractedSignals } from "../extraction/schemas";
import { EvaluationResult } from "./schemas";

export function crossCheckEvaluation(
  _signals: ExtractedSignals,
  evaluation: EvaluationResult
): { status: EvaluationResult["overall_status"]; mismatch: string | null } {
  const { budget, authority, need, timing } = evaluation.bant_scores;
  const allLow = budget.score <= 2 && authority.score <= 2 && need.score <= 2 && timing.score <= 2;

  if (allLow && evaluation.overall_status !== "Unqualified") {
    return {
      status: "Unqualified",
      mismatch: `All BANT dimensions scored <= 2 but evaluator returned "${evaluation.overall_status}"`,
    };
  }

  return { status: evaluation.overall_status, mismatch: null };
}
