import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalizeAEName } from "./mapping";

test("Michael Okom is not treated as Michael Hanson", () => {
  assert.equal(canonicalizeAEName("Michael Okom"), null);
});

test("Fathom-style typo Hansan maps to Michael Hanson", () => {
  assert.equal(canonicalizeAEName("Michael Hansan"), "Michael Hanson");
});

test("Michael Hanson canonical", () => {
  assert.equal(canonicalizeAEName("Michael Hanson"), "Michael Hanson");
});
