import { test } from "node:test";
import assert from "node:assert/strict";
import { prospectTextMentionsWorkflowAndAutomation } from "./workflowAutomationProspectScan";

test("adjacent workflow automation phrase is a hit", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "We need workflow automation here.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, true);
  assert.equal(r.phraseMentionCount, 1);
  assert.ok(r.snippets.length >= 1);
});

test("workflow-automation compound counts", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "Our workflow-automation roadmap.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, true);
  assert.equal(r.phraseMentionCount, 1);
});

test("workflow and automation with words between is not a hit", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "We need workflow and automation here.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, false);
  assert.equal(r.phraseMentionCount, 0);
});

test("automation before workflow does not count", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "automation and workflow engine", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, false);
});

test("phrase split across consecutive prospect lines still matches", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "We care about workflow", speakerLabel: "P" },
    { text: "automation tools.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, true);
  assert.equal(r.phraseMentionCount, 1);
});

test("multiple phrases increment count", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    {
      text: "workflow automation once and workflow automation twice",
      speakerLabel: "P",
    },
  ]);
  assert.equal(r.phraseMentionCount, 2);
});

test("automate alone does not count", () => {
  const r = prospectTextMentionsWorkflowAndAutomation([
    { text: "We want to automate everything and fix workflow.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, false);
});
