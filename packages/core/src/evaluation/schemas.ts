import { z } from "zod";

const bantDimensionScore = z.object({
  score: z.number().int().min(1).max(5),
  rationale: z.string(),
});

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
});

export type EvaluationResult = z.infer<typeof evaluationSchema>;
