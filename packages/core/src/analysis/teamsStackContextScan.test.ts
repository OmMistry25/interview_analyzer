import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTeamsInStackContext } from "./teamsStackContextScan";

test("microsoft teams phrase counts as phrase hit", () => {
  const r = detectTeamsInStackContext([
    { text: "We run everything on Microsoft Teams today.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, true);
  assert.ok(r.breakdown.phrase >= 1);
  assert.equal(r.breakdown.context_window, 0);
});

test("bare teams with stack anchor in window", () => {
  const r = detectTeamsInStackContext([
    { text: "We use Slack today but might move to Teams next quarter.", speakerLabel: "P" },
  ]);
  assert.equal(r.hit, true);
  assert.ok(r.breakdown.context_window >= 1);
});

test("bare teams without anchor is not a hit", () => {
  const r = detectTeamsInStackContext([{ text: "Our teams are aligned.", speakerLabel: "P" }]);
  assert.equal(r.hit, false);
});

test("teams meeting counts as phrase", () => {
  const r = detectTeamsInStackContext([{ text: "Join the teams meeting at 3.", speakerLabel: "P" }]);
  assert.equal(r.hit, true);
  assert.ok(r.breakdown.phrase >= 1);
});

test("ms teams variant", () => {
  const r = detectTeamsInStackContext([{ text: "We're on MS Teams for video.", speakerLabel: "P" }]);
  assert.equal(r.hit, true);
});
