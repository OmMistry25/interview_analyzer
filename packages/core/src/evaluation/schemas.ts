import { z } from "zod";

export const evaluationSchema = z.object({
  overall_status: z.enum(["Qualified", "Yellow", "Disqualified", "Needs Review"]),
  score: z.number().int().min(0).max(100),
  hard_disqualifiers: z.array(
    z.object({
      rule: z.string(),
      triggered: z.boolean(),
      evidence_refs: z.array(z.string()),
    })
  ),
  yellow_flags: z.array(
    z.object({
      flag: z.string(),
      triggered: z.boolean(),
      evidence_refs: z.array(z.string()),
    })
  ),
  green_signals: z.array(
    z.object({
      signal: z.string(),
      present: z.boolean(),
      evidence_refs: z.array(z.string()),
    })
  ),
  summary: z.string(),
  missing_critical_info: z.array(z.string()),
});

export type EvaluationResult = z.infer<typeof evaluationSchema>;
