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

const techStackSchema = z.object({
  slack: z.boolean(),
  teams: z.boolean(),
  okta: z.boolean(),
  google_workspace: z.boolean(),
  entra_ad: z.boolean(),
  itsm_tool: z.string(),
  mdm_tool: z.string(),
  knowledge_base: z.string(),
}).optional();

const itTeamStructureSchema = z.object({
  has_fulltime_it: z.boolean(),
  uses_msp: z.boolean(),
  team_size: z.union([z.string(), z.number()]),
  ticket_volume: z.union([z.string(), z.number()]),
}).optional();

const accountSchema = z.object({
  company_name: signalField,
  employee_count: signalFieldWithEvidence,
  identity_provider: signalFieldWithEvidence,
  scim_mentioned: signalFieldWithEvidence,
  competitors_mentioned: signalFieldWithEvidence,
  tech_stack: techStackSchema,
  it_team_structure: itTeamStructureSchema,
  icp_fit: z.enum(["strong_fit", "moderate_fit", "poor_fit", "unknown"]).optional(),
});

const qualificationSignalsSchema = z.object({
  demo_requested: z.boolean(),
  poc_mentioned: z.boolean(),
  poc_confirmed: z.boolean().optional(),
  nda_mentioned: z.boolean(),
  actively_evaluating_tools: z.boolean(),
  multiple_stakeholders_present: z.boolean(),
  competitor_bucket: z.enum(["ai_native_itsm", "workflow_based", "automation_platform", "none", "unknown"]),
  competitor_is_active_customer: z.boolean(),
}).optional();


const disqualifyingSignalSchema = z.object({
  value: z.boolean(),
  evidence: z.array(z.string()),
});

const unsupportedIdpSignalSchema = z.object({
  value: z.boolean(),
  idp_mentioned: z.string(),
  evidence: z.array(z.string()),
});

const competitorContractSignalSchema = z.object({
  value: z.boolean(),
  competitor: z.string(),
  contract_end: z.string(),
  evidence: z.array(z.string()),
});

const disqualifyingSignalsSchema = z.object({
  no_slack_and_no_teams: disqualifyingSignalSchema,
  msp_only_it: disqualifyingSignalSchema,
  below_200_employees: disqualifyingSignalSchema,
  unsupported_idp: unsupportedIdpSignalSchema,
  active_long_term_competitor_contract: competitorContractSignalSchema,
});

const defaultDisqualifyingSignals: z.infer<typeof disqualifyingSignalsSchema> = {
  no_slack_and_no_teams: { value: false, evidence: [] },
  msp_only_it: { value: false, evidence: [] },
  below_200_employees: { value: false, evidence: [] },
  unsupported_idp: { value: false, idp_mentioned: "unknown", evidence: [] },
  active_long_term_competitor_contract: {
    value: false,
    competitor: "unknown",
    contract_end: "unknown",
    evidence: [],
  },
};

const participantTitleSchema = z.object({
  name: z.string(),
  title: z.string(),
  role_in_deal: z.enum([
    "decision_maker",
    "champion",
    "coach",
    "evaluator",
    "end_user",
    "unknown",
  ]),
});

const stackMentionSchema = z.object({
  mention: z.string(),
  evidence: z.array(z.string()),
});

export const extractedSignalsSchema = z.object({
  budget: budgetSchema,
  authority: authoritySchema,
  need: needSchema,
  timing: timingSchema,
  account: accountSchema,
  qualification_signals: qualificationSignalsSchema,
  participant_titles: z.array(participantTitleSchema),
  call_summary: z.string(),
  disqualifying_signals: disqualifyingSignalsSchema.optional(),
  /** High-recall vendor/tool rows from the transcript (verbatim names + quotes). */
  stack_mentions: z.array(stackMentionSchema).optional(),
  /** Filled after extraction by matching snippets against packages/core/src/stack/catalog.ts */
  stack_canonical_hits: z.array(z.string()).optional(),
}).transform((parsed) => ({
  ...parsed,
  disqualifying_signals: parsed.disqualifying_signals ?? defaultDisqualifyingSignals,
}));

export type ExtractedSignals = z.infer<typeof extractedSignalsSchema>;
