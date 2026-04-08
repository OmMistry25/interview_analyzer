import { z } from "zod";

const bantDimensionScore = z.object({
  score: z.number().int().min(1).max(5),
  rationale: z.string(),
});

/** One row of the AE Stage-1 opportunity checklist (LLM output; yes-count added in code). */
export const s1ChecklistItemSchema = z.object({
  answer: z.enum(["yes", "no", "unclear"]),
  rationale: z.string(),
  evidence_quotes: z.array(z.string()).max(2).optional(),
});

export const s1OpportunityChecklistSchema = z.object({
  active_project_or_initiative: s1ChecklistItemSchema,
  defined_timeline: s1ChecklistItemSchema,
  clear_pain: s1ChecklistItemSchema,
  next_steps_confirmed: s1ChecklistItemSchema,
  stakeholder_access: s1ChecklistItemSchema,
});

export type S1OpportunityChecklist = z.infer<typeof s1OpportunityChecklistSchema>;

const S1_CHECKLIST_KEYS: (keyof S1OpportunityChecklist)[] = [
  "active_project_or_initiative",
  "defined_timeline",
  "clear_pain",
  "next_steps_confirmed",
  "stakeholder_access",
];

export function countS1ChecklistYes(checklist: S1OpportunityChecklist): number {
  return S1_CHECKLIST_KEYS.filter((k) => checklist[k].answer === "yes").length;
}

export const evaluationSchema = z.object({
  bant_scores: z.object({
    budget: bantDimensionScore,
    authority: bantDimensionScore,
    need: bantDimensionScore,
    timing: bantDimensionScore,
  }),
  stage_1_probability: z.number().int().min(0).max(100),
  stage_1_reasoning: z.string(),
  overall_status: z.enum(["Qualified", "Needs Work", "Unqualified"]),
  s1_type: z.enum(["sell_s1", "chase_s1", "not_s1"]).optional(),
  icp_fit: z.enum(["strong_fit", "moderate_fit", "poor_fit", "unknown"]).optional(),
  green_flags: z.array(z.string()).optional(),
  red_flags: z.array(z.string()).optional(),
  call_notes: z.string(),
  coaching_notes: z.array(z.string()),
  next_steps: z.array(z.string()),
  score: z.number().int().min(0).max(100),
  s1_opportunity_checklist: s1OpportunityChecklistSchema,
});

/** Persisted / in-memory evaluation always includes the derived yes-count (not from the LLM). */
export type EvaluationResult = z.infer<typeof evaluationSchema> & {
  s1_checklist_yes_count: number;
};

export function withS1ChecklistYesCount(parsed: z.infer<typeof evaluationSchema>): EvaluationResult {
  return {
    ...parsed,
    s1_checklist_yes_count: countS1ChecklistYes(parsed.s1_opportunity_checklist),
  };
}
