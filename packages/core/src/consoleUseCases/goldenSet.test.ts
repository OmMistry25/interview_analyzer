/**
 * Lightweight golden harness: expected use-case ids after the evidence guard,
 * without calling the LLM. Extend `cases` as you add hand-labeled transcripts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEvidenceGuardToUseCases } from "./evidenceGuard";
import type { ConsoleUseCasesLlmOutput } from "./schemas";
import type { NormalizedUtterance } from "../types/normalized";

function u(text: string, idx: number): NormalizedUtterance {
  return {
    idx,
    speakerLabelRaw: "P",
    timestampStartSec: null,
    timestampEndSec: null,
    textRaw: text,
    textNormalized: text,
  };
}

const cases: Array<{
  name: string;
  utterances: NormalizedUtterance[];
  llmHypothesis: ConsoleUseCasesLlmOutput;
  expectedIds: string[];
}> = [
  {
    name: "msp_and_ticketing",
    utterances: [
      u(
        "We are an MSP and each customer has their own Slack; tickets still land in our shared ConnectWise queue.",
        0
      ),
    ],
    llmHypothesis: {
      items: [
        {
          id: "msp_multi_tenant",
          confidence: "high",
          evidence: ["We are an MSP and each customer has their own Slack"],
        },
        {
          id: "itsm_service_desk",
          confidence: "high",
          evidence: ["tickets still land in our shared ConnectWise queue"],
        },
      ],
    },
    expectedIds: ["msp_multi_tenant", "itsm_service_desk"],
  },
  {
    name: "kb_only_not_compliance",
    utterances: [
      u(
        "We want employees to search Confluence first so L1 stops copying the same macro answers.",
        0
      ),
    ],
    llmHypothesis: {
      items: [
        {
          id: "knowledge_deflection",
          confidence: "high",
          evidence: ["search Confluence first so L1 stops copying the same macro answers"],
        },
        {
          id: "compliance_audit",
          confidence: "low",
          evidence: ["annual SOC2 cycle"],
        },
      ],
    },
    expectedIds: ["knowledge_deflection"],
  },
];

for (const c of cases) {
  test(`golden: ${c.name}`, () => {
    const guarded = applyEvidenceGuardToUseCases(c.llmHypothesis, c.utterances);
    const ids = guarded.items.map((i) => i.id).sort();
    const exp = [...c.expectedIds].sort();
    assert.deepEqual(ids, exp);
  });
}
