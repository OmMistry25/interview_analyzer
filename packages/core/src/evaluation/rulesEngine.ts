import { ExtractedSignals } from "../extraction/schemas";
import { EvaluationResult } from "./schemas";

export interface HardDQResult {
  rule: string;
  triggered: boolean;
}

export function checkHardDisqualifiers(signals: ExtractedSignals): HardDQResult[] {
  const results: HardDQResult[] = [];

  // Rule 1: employee_count < 50
  const empVal = signals.employee_count.value;
  const empCount = typeof empVal === "number" ? empVal : parseInt(String(empVal), 10);
  results.push({
    rule: "employee_count < 50",
    triggered: !isNaN(empCount) && empCount < 50,
  });

  // Rule 2: No pain points AND no current solution
  const noPain =
    signals.pain_points.value === "unknown" ||
    (Array.isArray(signals.pain_points.value) && signals.pain_points.value.length === 0);
  const noSolution = signals.current_solution.value === "unknown";
  results.push({
    rule: "No pain points AND no current solution identified",
    triggered: noPain && noSolution,
  });

  return results;
}

export function crossCheckEvaluation(
  signals: ExtractedSignals,
  evaluation: EvaluationResult
): { status: EvaluationResult["overall_status"]; mismatch: string | null } {
  const hardDQs = checkHardDisqualifiers(signals);
  const anyTriggered = hardDQs.some((d) => d.triggered);

  if (anyTriggered && evaluation.overall_status !== "Disqualified") {
    const triggered = hardDQs.filter((d) => d.triggered).map((d) => d.rule);
    return {
      status: "Needs Review",
      mismatch: `Rules engine triggered hard DQ [${triggered.join("; ")}] but evaluator returned "${evaluation.overall_status}"`,
    };
  }

  if (!anyTriggered && evaluation.overall_status === "Disqualified") {
    return {
      status: "Needs Review",
      mismatch: `Evaluator returned "Disqualified" but no hard DQ rules triggered`,
    };
  }

  return { status: evaluation.overall_status, mismatch: null };
}
