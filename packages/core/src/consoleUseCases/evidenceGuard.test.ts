import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEvidenceGuardToUseCases,
  buildTranscriptMatchBlob,
  filterEvidenceAgainstTranscript,
  filterVendorDefinitionEvidence,
} from "./evidenceGuard";
import type { ConsoleUseCasesLlmOutput } from "./schemas";

function u(text: string, idx = 0) {
  return {
    idx,
    speakerLabelRaw: "A",
    timestampStartSec: null as number | null,
    timestampEndSec: null as number | null,
    textRaw: text,
    textNormalized: text,
  };
}

test("filterEvidenceAgainstTranscript keeps quotes present in transcript", () => {
  const utterances = [u("We route all access requests through ServiceNow before Okta.")];
  const blob = buildTranscriptMatchBlob(utterances);
  const kept = filterEvidenceAgainstTranscript(
    ["access requests through ServiceNow", "this text is not in the call"],
    blob
  );
  assert.equal(kept.length, 1);
  assert.ok(kept[0].includes("access requests"));
});

test("filterEvidenceAgainstTranscript drops short junk", () => {
  const utterances = [u("Long enough transcript segment for matching purposes here.")];
  const blob = buildTranscriptMatchBlob(utterances);
  const kept = filterEvidenceAgainstTranscript(["short"], blob);
  assert.equal(kept.length, 0);
});

test("applyEvidenceGuardToUseCases drops hallucinated item entirely", () => {
  const utterances = [u("Our team lives in Jira for IT tickets all day.")];
  const parsed: ConsoleUseCasesLlmOutput = {
    items: [
      {
        id: "itsm_service_desk",
        confidence: "high",
        evidence: ["Jira for IT tickets"],
      },
      {
        id: "compliance_audit",
        confidence: "medium",
        evidence: ["SOC2 audit next quarter with external firm"],
      },
    ],
  };
  const out = applyEvidenceGuardToUseCases(parsed, utterances);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].id, "itsm_service_desk");
});

test("filterVendorDefinitionEvidence drops Console-is pitch line", () => {
  const pitch =
    "Console is an AI co-worker to automate internal support requests, right?";
  const kept = filterVendorDefinitionEvidence([pitch], "console");
  assert.equal(kept.length, 0);
});

test("filterVendorDefinitionEvidence keeps legitimate customer automation quote", () => {
  const q =
    "We want to automate approvals across ServiceNow and Okta for our team.";
  const kept = filterVendorDefinitionEvidence([q], "console");
  assert.equal(kept.length, 1);
  assert.equal(kept[0], q);
});

test("filterVendorDefinitionEvidence keeps customer evaluating Console is compatible", () => {
  const q = "We need to know if Console is compatible with our Entra setup.";
  const kept = filterVendorDefinitionEvidence([q], "console");
  assert.equal(kept.length, 1);
});

test("applyEvidenceGuardToUseCases drops workflow_automation and ai_assisted_support when only pitch evidence", () => {
  const utterances = [
    u(
      "Console is an AI co-worker to automate internal support requests, right? We also have a lot of tickets.",
      0
    ),
  ];
  const parsed: ConsoleUseCasesLlmOutput = {
    items: [
      {
        id: "workflow_automation",
        confidence: "medium",
        evidence: ["Console is an AI co-worker to automate internal support requests, right?"],
      },
      {
        id: "ai_assisted_support",
        confidence: "medium",
        evidence: ["Console is an AI co-worker to automate internal support requests, right?"],
      },
      {
        id: "itsm_service_desk",
        confidence: "high",
        evidence: ["We also have a lot of tickets"],
      },
    ],
  };
  const out = applyEvidenceGuardToUseCases(parsed, utterances, "console");
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].id, "itsm_service_desk");
});

test("applyEvidenceGuardToUseCases merges duplicate ids", () => {
  const utterances = [
    u("We need better onboarding access for new hires.", 0),
    u("Onboarding is manual today in Okta.", 1),
  ];
  const parsed: ConsoleUseCasesLlmOutput = {
    items: [
      {
        id: "employee_lifecycle",
        confidence: "medium",
        evidence: ["better onboarding access for new hires"],
      },
      {
        id: "employee_lifecycle",
        confidence: "high",
        evidence: ["Onboarding is manual today in Okta"],
      },
    ],
  };
  const out = applyEvidenceGuardToUseCases(parsed, utterances);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].confidence, "high");
  assert.ok(out.items[0].evidence.length >= 2);
});
