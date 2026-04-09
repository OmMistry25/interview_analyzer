import { evaluationSchema, withS1ChecklistYesCount, type EvaluationResult } from "../evaluation/schemas";
import { extractedSignalsSchema, type ExtractedSignals } from "../extraction/schemas";
import { enrichExtractedSignalsStackCatalog } from "../stack/enrichSignals";
import type { MeetingContext } from "../types/normalized";
import type { NormalizedCall } from "../types/normalized";

const uk = { value: "unknown" as const, evidence: [] as string[] };
const f = { value: false as const, evidence: [] as string[] };
const emptyStrArr = { value: [] as string[], evidence: [] as string[] };
const sent = {
  disposition: "unknown" as const,
  summary: "No transcript — no show.",
  evidence: [] as string[],
};

function checklistNo(): { answer: "no"; rationale: string } {
  return { answer: "no", rationale: "No show — no meeting content." };
}

/** Valid minimal extracted signals for no-show (no LLM). */
export function buildNoShowExtractedSignals(
  call: NormalizedCall,
  _ctx: MeetingContext
): ExtractedSignals {
  const prospectNames = call.participants.filter((p) => p.role === "prospect").map((p) => p.name);
  const participant_titles =
    prospectNames.length > 0
      ? prospectNames.map((name) => ({
          name,
          title: "unknown",
          role_in_deal: "unknown" as const,
        }))
      : [{ name: "Unknown attendee", title: "unknown", role_in_deal: "unknown" as const }];

  const raw = {
    budget: {
      discussed: f,
      details: uk,
      budget_alignment: "unknown" as const,
      prospect_sentiment: sent,
    },
    authority: {
      decision_maker_identified: f,
      decision_maker_name: uk,
      buying_process: uk,
      champion_identified: f,
      prospect_sentiment: sent,
    },
    need: {
      pain_points: emptyStrArr,
      current_solution: uk,
      urgency_level: uk,
      prospect_sentiment: sent,
    },
    timing: {
      timeline: uk,
      upcoming_events: uk,
      demo_scheduled: f,
      next_steps: emptyStrArr,
      prospect_sentiment: sent,
    },
    account: {
      company_name: { value: "unknown", evidence: [] as string[] },
      employee_count: uk,
      identity_provider: uk,
      scim_mentioned: f,
      competitors_mentioned: emptyStrArr,
    },
    qualification_signals: {
      demo_requested: false,
      poc_mentioned: false,
      poc_confirmed: false,
      nda_mentioned: false,
      actively_evaluating_tools: false,
      multiple_stakeholders_present: false,
      competitor_bucket: "unknown" as const,
      competitor_is_active_customer: false,
    },
    participant_titles,
    call_summary: "No show — no usable transcript.",
  };

  const parsed = extractedSignalsSchema.parse(raw);
  return enrichExtractedSignalsStackCatalog(parsed);
}

export function buildNoShowEvaluation(): EvaluationResult {
  const rationale = "No show — no usable transcript.";
  const row = checklistNo();
  const raw = {
    bant_scores: {
      budget: { score: 1, rationale },
      authority: { score: 1, rationale },
      need: { score: 1, rationale },
      timing: { score: 1, rationale },
    },
    stage_1_probability: 0,
    stage_1_reasoning: "No show.",
    overall_status: "Unqualified" as const,
    s1_type: "not_s1" as const,
    icp_fit: "unknown" as const,
    green_flags: [] as string[],
    red_flags: ["No show"],
    call_notes: "No show.",
    coaching_notes: ["Reschedule or confirm prospect attendance."],
    next_steps: [] as string[],
    score: 0,
    s1_opportunity_checklist: {
      active_project_or_initiative: row,
      defined_timeline: row,
      clear_pain: row,
      next_steps_confirmed: row,
      stakeholder_access: row,
    },
  };
  return withS1ChecklistYesCount(evaluationSchema.parse(raw));
}
