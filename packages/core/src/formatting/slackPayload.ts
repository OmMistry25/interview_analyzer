import type { EvaluationResult } from "../evaluation/schemas";
import type { ExtractedSignals } from "../extraction/schemas";

interface SlackContext {
  aeName: string | null;
  accountName: string | null;
  meetingTitle: string;
}

function scorePips(score: number): string {
  return "●".repeat(score) + "○".repeat(5 - score);
}

function sentimentLabel(disposition: string): string {
  const map: Record<string, string> = {
    positive: "Positive",
    neutral: "Neutral",
    cautious: "Cautious",
    negative: "Negative",
    unknown: "Unknown",
  };
  return map[disposition] ?? disposition;
}

export function formatGrowthTeamDigest(
  evaluation: EvaluationResult,
  signals: ExtractedSignals,
  ctx: SlackContext
) {
  const ae = ctx.aeName ?? "Unknown AE";
  const account = ctx.accountName ?? "Unknown Account";
  const b = evaluation.bant_scores;

  const participantLines = signals.participant_titles
    .map((p) => `• ${p.name} — ${p.title}`)
    .join("\n");

  const text = [
    `*${ae}* just met with *${account}*`,
    "",
    `*Participants*`,
    participantLines || "_(none detected)_",
    "",
    `*Call Notes*`,
    evaluation.call_notes,
    "",
    `*Budget* ${scorePips(b.budget.score)} (${b.budget.score}/5)`,
    b.budget.rationale,
    `Alignment: ${signals.budget.budget_alignment} · Prospect: ${sentimentLabel(signals.budget.prospect_sentiment.disposition)}`,
    "",
    `*Authority* ${scorePips(b.authority.score)} (${b.authority.score}/5)`,
    b.authority.rationale,
    `Prospect: ${sentimentLabel(signals.authority.prospect_sentiment.disposition)}`,
    "",
    `*Need* ${scorePips(b.need.score)} (${b.need.score}/5)`,
    b.need.rationale,
    `Prospect: ${sentimentLabel(signals.need.prospect_sentiment.disposition)}`,
    "",
    `*Timing* ${scorePips(b.timing.score)} (${b.timing.score}/5)`,
    b.timing.rationale,
    `Prospect: ${sentimentLabel(signals.timing.prospect_sentiment.disposition)}`,
    "",
    `*Stage 1 Probability:* ${evaluation.stage_1_probability}% — ${evaluation.overall_status}`,
    evaluation.stage_1_reasoning,
  ].join("\n");

  return {
    ae_name: ctx.aeName,
    account_name: ctx.accountName,
    meeting_title: ctx.meetingTitle,
    overall_status: evaluation.overall_status,
    stage_1_probability: evaluation.stage_1_probability,
    text,
  };
}

export function formatAESlackMessage(
  evaluation: EvaluationResult,
  signals: ExtractedSignals,
  ctx: SlackContext
) {
  const account = ctx.accountName ?? "Unknown Account";
  const b = evaluation.bant_scores;

  const nextSteps = evaluation.next_steps
    .map((s) => `• ${s}`)
    .join("\n");

  const coaching = evaluation.coaching_notes
    .map((n) => `• ${n}`)
    .join("\n");

  const text = [
    `*Your call with ${account}* — ${evaluation.overall_status} (${evaluation.stage_1_probability}%)`,
    "",
    `*BANT Summary*`,
    `Budget: ${scorePips(b.budget.score)} — ${b.budget.rationale}`,
    `Authority: ${scorePips(b.authority.score)} — ${b.authority.rationale}`,
    `Need: ${scorePips(b.need.score)} — ${b.need.rationale}`,
    `Timing: ${scorePips(b.timing.score)} — ${b.timing.rationale}`,
    "",
    `*Next Steps*`,
    nextSteps || "_(none)_",
    "",
    `*Coaching Notes*`,
    coaching || "_(none)_",
  ].join("\n");

  return {
    ae_name: ctx.aeName,
    account_name: ctx.accountName,
    meeting_title: ctx.meetingTitle,
    overall_status: evaluation.overall_status,
    stage_1_probability: evaluation.stage_1_probability,
    text,
  };
}
