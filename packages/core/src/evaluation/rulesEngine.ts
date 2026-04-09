import { ExtractedSignals } from "../extraction/schemas";
import { EvaluationResult } from "./schemas";
import type { DealSegment } from "../enrichment/apollo";

/** `chase_s1` means qualified S1 motion; never pair with Needs Work (prompt + enforcement). */
export function alignChaseS1OverallStatus(evaluation: EvaluationResult): void {
  if (evaluation.s1_type === "chase_s1" && evaluation.overall_status === "Needs Work") {
    evaluation.overall_status = "Qualified";
  }
}

/**
 * BANT-based sanity check only. We intentionally do **not** override `overall_status` from
 * `s1_opportunity_checklist` / `s1_checklist_yes_count` until AE calibration (e.g. logging when
 * yes_count >= 3 but s1_type is not_s1) can be reviewed.
 */
export function crossCheckEvaluation(
  _signals: ExtractedSignals,
  evaluation: EvaluationResult,
  dealSegment: DealSegment = "mid_tier"
): { status: EvaluationResult["overall_status"]; mismatch: string | null } {
  const { authority, need, timing } = evaluation.bant_scores;

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
    // Mid-tier: budget is not a primary gate — only force Unqualified when core discovery (authority, need, timing) is uniformly weak.
    const coreLow = authority.score <= 2 && need.score <= 2 && timing.score <= 2;
    if (coreLow && evaluation.overall_status !== "Unqualified") {
      return {
        status: "Unqualified",
        mismatch: `Mid-tier: authority, need, and timing all scored <= 2 but evaluator returned "${evaluation.overall_status}"`,
      };
    }
  }

  return { status: evaluation.overall_status, mismatch: null };
}
