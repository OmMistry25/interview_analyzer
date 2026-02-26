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

const prospectSentiment = z.object({
  disposition: z.enum(["positive", "neutral", "cautious", "negative", "unknown"]),
  summary: z.string(),
  evidence: z.array(z.string()),
});

const budgetSchema = z.object({
  discussed: signalFieldWithEvidence,
  details: signalFieldWithEvidence,
  budget_alignment: z.enum(["aligned", "gap_small", "gap_large", "unknown"]),
  prospect_sentiment: prospectSentiment,
});

const authoritySchema = z.object({
  decision_maker_identified: signalFieldWithEvidence,
  decision_maker_name: signalFieldWithEvidence,
  buying_process: signalFieldWithEvidence,
  champion_identified: signalFieldWithEvidence,
  prospect_sentiment: prospectSentiment,
});

const needSchema = z.object({
  pain_points: signalFieldWithEvidence,
  current_solution: signalFieldWithEvidence,
  urgency_level: signalFieldWithEvidence,
  prospect_sentiment: prospectSentiment,
});

const timingSchema = z.object({
  timeline: signalFieldWithEvidence,
  upcoming_events: signalFieldWithEvidence,
  demo_scheduled: signalFieldWithEvidence,
  next_steps: signalFieldWithEvidence,
  prospect_sentiment: prospectSentiment,
});

const accountSchema = z.object({
  company_name: signalField, // Evidence optional — often derived from meeting title metadata
  employee_count: signalFieldWithEvidence,
  identity_provider: signalFieldWithEvidence,
  scim_mentioned: signalFieldWithEvidence,
  competitors_mentioned: signalFieldWithEvidence,
});

const participantTitleSchema = z.object({
  name: z.string(),
  title: z.string(),
  role_in_deal: z.enum(["decision_maker", "champion", "evaluator", "end_user", "unknown"]),
});

export const extractedSignalsSchema = z.object({
  budget: budgetSchema,
  authority: authoritySchema,
  need: needSchema,
  timing: timingSchema,
  account: accountSchema,
  participant_titles: z.array(participantTitleSchema),
  call_summary: z.string(),
});

export type ExtractedSignals = z.infer<typeof extractedSignalsSchema>;
