import { z } from "zod";

const signalField = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  evidence: z.array(z.string()),
});

const nonUnknownHasEvidence = (
  field: z.infer<typeof signalField>,
  ctx: z.RefinementCtx
) => {
  const isUnknown = field.value === "unknown";
  const isEmpty = Array.isArray(field.value) && field.value.length === 0;
  const isFalse = field.value === false;
  if (!isUnknown && !isEmpty && !isFalse && field.evidence.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-unknown value must include at least one evidence quote",
    });
  }
};

const signalFieldWithEvidence = signalField.superRefine(nonUnknownHasEvidence);

export const extractedSignalsSchema = z.object({
  company_name: signalField, // Evidence optional — often derived from meeting title metadata
  employee_count: signalFieldWithEvidence,
  current_solution: signalFieldWithEvidence,
  pain_points: signalFieldWithEvidence,
  budget_mentioned: signalFieldWithEvidence,
  timeline: signalFieldWithEvidence,
  decision_maker_present: signalFieldWithEvidence,
  competitors_mentioned: signalFieldWithEvidence,
  next_steps_discussed: signalFieldWithEvidence,
  identity_provider: signalFieldWithEvidence,
  scim_mentioned: signalFieldWithEvidence,
  demo_scheduled: signalFieldWithEvidence,
});

export type ExtractedSignals = z.infer<typeof extractedSignalsSchema>;
