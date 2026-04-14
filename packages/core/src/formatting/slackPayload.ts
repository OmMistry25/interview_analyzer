import type { EvaluationResult } from "../evaluation/schemas";
import type { ExtractedSignals } from "../extraction/schemas";
import type { ConsoleUseCasesDocument } from "../consoleUseCases/schemas";
import { consoleUseCaseLabel } from "../consoleUseCases/taxonomy";
import { stackCatalogLabel } from "../stack/catalog";

/** Slack callback `growth_team` / `ae` payload; `overall_status` may be `"No show"` for compact no-show layout (Zapier filters may need updating). */
export type SlackDigestOverallStatus = EvaluationResult["overall_status"] | "No show";

export interface SlackContext {
  aeName: string | null;
  accountName: string | null;
  meetingTitle: string;
  /** First external / prospect attendee display name when known (calendar). */
  prospectAttendeeName?: string | null;
}

export interface SlackFormatOptions {
  /** Minimal Zapier/Slack body: status + no-show only (no BANT, stack, checklist). */
  noShow?: boolean;
  /** When pipeline enabled; shown on Growth digest under Tech stack when items exist. */
  consoleUseCases?: ConsoleUseCasesDocument | null;
}

function formatConsoleUseCasesForDigest(doc: ConsoleUseCasesDocument | null | undefined): string | null {
  if (!doc?.items?.length) return null;
  return doc.items
    .map((it) => `${consoleUseCaseLabel(it.id)} (${it.confidence})`)
    .join("; ");
}

function scorePips(score: number): string {
  return "●".repeat(score) + "○".repeat(5 - score);
}

const PROSPECT_ABSENT_NEEDLES = [
  "absence of the prospect",
  "did not attend",
  "didn't attend",
  "did not join",
  "didn't join",
  "prospect did not attend",
  "prospect didn't attend",
  "prospect never",
  "prospect was absent",
  "prospect was not present",
  "prospect did not join",
  "prospect didn't join",
  "no prospect",
  "no-show",
  "no show",
  "never joined",
  "did not show",
  "didn't show",
  "nobody from",
  "customer did not attend",
  "attendee did not attend",
] as const;

/**
 * When the model clearly describes a prospect no-show but the transcript is long (e.g. internal prep),
 * still use the compact Slack layout instead of a misleading full BANT digest.
 */
export function shouldUseNoShowSlackLayout(evaluation: EvaluationResult): boolean {
  const blob = [
    evaluation.call_notes,
    evaluation.stage_1_reasoning,
    ...(evaluation.red_flags ?? []),
  ]
    .join("\n")
    .toLowerCase();
  return PROSPECT_ABSENT_NEEDLES.some((n) => blob.includes(n));
}

function formatNoShowSlackText(ctx: SlackContext): string {
  const ae = ctx.aeName?.trim() || "The AE";
  const account = ctx.accountName?.trim();
  const attendee = ctx.prospectAttendeeName?.trim() || "the prospect";

  const lines: string[] = [];
  if (account) {
    lines.push(`*${ae}* / *${account}* — *No show.* The prospect did not join, so there was no discovery conversation to score.`);
  } else {
    lines.push(`*${ae}* — *No show.* The prospect did not join, so there was no discovery conversation to score.`);
  }
  lines.push("");
  lines.push(`*${ae}* to reschedule with *${attendee}*.`);
  return `${lines.join("\n")}\n`;
}

function formatTechStackStructured(
  ts: NonNullable<ExtractedSignals["account"]["tech_stack"]>
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(ts)) {
    if (val === true) {
      parts.push(key.replace(/_/g, " "));
    } else if (typeof val === "string" && val.trim() && val.toLowerCase() !== "unknown") {
      parts.push(`${key.replace(/_/g, " ")}: ${val}`);
    }
  }
  return parts.join(", ");
}

/** Comma-separated stack labels: canonical catalog first, else structured account.tech_stack. Empty if nothing to show. */
export function formatCanonicalStackForDigest(signals: ExtractedSignals): string {
  const hits = signals.stack_canonical_hits ?? [];
  if (hits.length > 0) {
    return hits.map((id) => stackCatalogLabel(id)).join(", ");
  }
  const ts = signals.account.tech_stack;
  if (ts) {
    const s = formatTechStackStructured(ts);
    if (s) return s;
  }
  return "";
}

/** Primary competitors line from account.competitors_mentioned; empty when unknown / absent. */
export function formatCompetitorsMentionedForDigest(signals: ExtractedSignals): string {
  const field = signals.account.competitors_mentioned;
  if (!field) return "";
  const v = field.value;
  if (v === false || v === "unknown") return "";
  if (typeof v === "string" && (!v.trim() || v.toLowerCase() === "unknown")) return "";
  if (Array.isArray(v)) {
    const items = v.map((x) => String(x).trim()).filter(Boolean);
    return items.length ? items.join(", ") : "";
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Competitors discussed" : "";
  return String(v).trim();
}

/** True when we should show job title next to name (omit empty / literal "unknown"). */
export function shouldShowParticipantTitle(title: string): boolean {
  const t = title.trim();
  return t.length > 0 && t.toLowerCase() !== "unknown";
}

export function formatGrowthTeamDigest(
  evaluation: EvaluationResult,
  signals: ExtractedSignals,
  ctx: SlackContext,
  options?: SlackFormatOptions
) {
  if (options?.noShow) {
    return {
      ae_name: ctx.aeName,
      account_name: ctx.accountName,
      meeting_title: ctx.meetingTitle,
      overall_status: "No show",
      stage_1_probability: 0,
      text: formatNoShowSlackText(ctx),
    };
  }

  const ae = ctx.aeName ?? "Unknown AE";
  const account = ctx.accountName ?? "Unknown Account";
  const b = evaluation.bant_scores;

  const participantLines = signals.participant_titles
    .map((p) =>
      shouldShowParticipantTitle(p.title)
        ? `• ${p.name} — ${p.title}`
        : `• ${p.name}`
    )
    .join("\n");

  const stackLine = formatCanonicalStackForDigest(signals);
  const competitorsLine = formatCompetitorsMentionedForDigest(signals);
  const useCasesLine = formatConsoleUseCasesForDigest(options?.consoleUseCases ?? null);

  const text = [
    `*${ae}* just met with *${account}*`,
    "",
    `*Status:* ${evaluation.overall_status}`,
    evaluation.stage_1_reasoning,
    "",
    `*Tech stack*`,
    stackLine || "_(none detected)_",
    ...(useCasesLine ? ["", `*Console use cases*`, useCasesLine] : []),
    "",
    `*Competitors*`,
    competitorsLine || "_(none detected)_",
    "",
    `*Participants*`,
    participantLines || "_(none detected)_",
    "",
    `*Call Notes*`,
    evaluation.call_notes,
    "",
    `*Budget* ${scorePips(b.budget.score)} (${b.budget.score}/5)`,
    b.budget.rationale,
    "",
    `*Authority* ${scorePips(b.authority.score)} (${b.authority.score}/5)`,
    b.authority.rationale,
    "",
    `*Need* ${scorePips(b.need.score)} (${b.need.score}/5)`,
    b.need.rationale,
    "",
    `*Timing* ${scorePips(b.timing.score)} (${b.timing.score}/5)`,
    b.timing.rationale,
    "",
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
  ctx: SlackContext,
  options?: SlackFormatOptions
) {
  if (options?.noShow) {
    return {
      ae_name: ctx.aeName,
      account_name: ctx.accountName,
      meeting_title: ctx.meetingTitle,
      overall_status: "No show",
      stage_1_probability: 0,
      text: formatNoShowSlackText(ctx),
    };
  }

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
