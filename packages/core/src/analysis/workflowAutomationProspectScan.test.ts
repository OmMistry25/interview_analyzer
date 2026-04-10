import { test } from "node:test";
import assert from "node:assert/strict";
import { prospectTextMentionsWorkflowAndAutomation } from "./workflowAutomationProspectScan";

test("same utterance: both words counts as hit", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "We need workflow and automation here.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, true);
  assert.ok(r.snippets.length >= 1);
});

test("AE-only list would be empty in real pipeline; prospect without both words is miss", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "Our workflow is manual.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, false);
});

test("two adjacent prospect lines within char window", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "We care about workflow.", speakerLabel: "P" },
    { text: "And automation.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, true);
});

test("automate alone does not count", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "We want to automate everything and fix workflow.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, false);
});
