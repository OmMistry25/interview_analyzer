import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluationSchema } from "../evaluation/schemas";
import { extractedSignalsSchema } from "../extraction/schemas";
import {
  formatGrowthTeamDigest,
  shouldUseNoShowSlackLayout,
} from "./slackPayload";

function minimalEvaluation(overrides: Partial<Record<string, unknown>>) {
  const base = {
    bant_scores: {
      budget: { score: 1, rationale: "x" },
      authority: { score: 1, rationale: "x" },
      need: { score: 1, rationale: "x" },
      timing: { score: 1, rationale: "x" },
    },
    stage_1_probability: 0,
    stage_1_reasoning: "x",
    overall_status: "Unqualified" as const,
    s1_type: "not_s1" as const,
    icp_fit: "unknown" as const,
    green_flags: [] as string[],
    red_flags: [] as string[],
    call_notes: "x",
    coaching_notes: [] as string[],
    next_steps: [] as string[],
    score: 0,
    s1_opportunity_checklist: {
      active_project_or_initiative: { answer: "no" as const, rationale: "x" },
      defined_timeline: { answer: "no" as const, rationale: "x" },
      clear_pain: { answer: "no" as const, rationale: "x" },
      next_steps_confirmed: { answer: "no" as const, rationale: "x" },
      stakeholder_access: { answer: "no" as const, rationale: "x" },
    },
  };
  return evaluationSchema.parse({ ...base, ...overrides });
}

test("shouldUseNoShowSlackLayout matches prospect absence phrasing", () => {
  const ev = minimalEvaluation({
    call_notes:
      "The meeting with Agreeya did not proceed as planned because the prospect, Manuel Coleman, did not attend.",
    stage_1_reasoning:
      "The call did not progress due to the absence of the prospect, resulting in no discovery of BANT elements.",
  });
  assert.equal(shouldUseNoShowSlackLayout(ev), true);
});

test("shouldUseNoShowSlackLayout false for normal discovery", () => {
  const ev = minimalEvaluation({
    call_notes: "Discussed budget and timeline for Q3 rollout.",
    stage_1_reasoning: "Strong fit; champion engaged.",
  });
  assert.equal(shouldUseNoShowSlackLayout(ev), false);
});

test("formatGrowthTeamDigest no-show omits Unqualified and adds reschedule line", () => {
  const evaluation = minimalEvaluation({ call_notes: "ignored in no-show layout" });
  const signals = extractedSignalsSchema.parse({
    budget: {
      discussed: { value: false, evidence: [] },
      details: { value: "unknown", evidence: [] },
      budget_alignment: "unknown",
      prospect_sentiment: { disposition: "unknown", summary: "", evidence: [] },
    },
    authority: {
      decision_maker_identified: { value: false, evidence: [] },
      decision_maker_name: { value: "unknown", evidence: [] },
      buying_process: { value: "unknown", evidence: [] },
      champion_identified: { value: false, evidence: [] },
      prospect_sentiment: { disposition: "unknown", summary: "", evidence: [] },
    },
    need: {
      pain_points: { value: [], evidence: [] },
      current_solution: { value: "unknown", evidence: [] },
      urgency_level: { value: "unknown", evidence: [] },
      prospect_sentiment: { disposition: "unknown", summary: "", evidence: [] },
    },
    timing: {
      timeline: { value: "unknown", evidence: [] },
      upcoming_events: { value: "unknown", evidence: [] },
      demo_scheduled: { value: false, evidence: [] },
      next_steps: { value: [], evidence: [] },
      prospect_sentiment: { disposition: "unknown", summary: "", evidence: [] },
    },
    account: {
      company_name: { value: "unknown", evidence: [] },
      employee_count: { value: "unknown", evidence: [] },
      identity_provider: { value: "unknown", evidence: [] },
      scim_mentioned: { value: false, evidence: [] },
      competitors_mentioned: { value: [], evidence: [] },
    },
    qualification_signals: {
      demo_requested: false,
      poc_mentioned: false,
      poc_confirmed: false,
      nda_mentioned: false,
      actively_evaluating_tools: false,
      multiple_stakeholders_present: false,
      competitor_bucket: "unknown",
      competitor_is_active_customer: false,
    },
    participant_titles: [],
    call_summary: "",
  });

  const digest = formatGrowthTeamDigest(evaluation, signals, {
    aeName: "Eric Bower",
    accountName: "Agreeya",
    meetingTitle: "Intro",
    prospectAttendeeName: "Manuel Coleman",
  }, { noShow: true });

  assert.equal(digest.overall_status, "No show");
  assert.ok(!digest.text.includes("Unqualified"));
  assert.ok(digest.text.includes("*Eric Bower* to reschedule with *Manuel Coleman*"));
  assert.ok(digest.text.includes("*No show.*"));
});
