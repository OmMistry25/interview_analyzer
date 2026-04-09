import assert from "node:assert/strict";
import { test } from "node:test";
import { isNoShowCall, NO_SHOW_MAX_TRANSCRIPT_CHARS } from "./noShow";
import type { NormalizedCall } from "../types/normalized";

const base: Omit<NormalizedCall, "utterances"> = {
  sourceMeetingId: null,
  sourceRecordingId: null,
  title: "Console / Acme intro",
  startTime: null,
  endTime: null,
  shareUrl: null,
  fathomUrl: null,
  participants: [],
};

function u(text: string) {
  return {
    idx: 0,
    speakerLabelRaw: "Speaker",
    timestampStartSec: null as number | null,
    timestampEndSec: null as number | null,
    textRaw: text,
    textNormalized: text,
  };
}

test("empty utterances is no-show", () => {
  assert.equal(isNoShowCall({ ...base, utterances: [] }), true);
});

test("very short transcript (under threshold) is no-show", () => {
  const short = "x".repeat(Math.max(0, NO_SHOW_MAX_TRANSCRIPT_CHARS - 1));
  assert.equal(isNoShowCall({ ...base, utterances: [u(short)] }), true);
});

test("twenty-char utterance is no-show", () => {
  assert.equal(isNoShowCall({ ...base, utterances: [u("hello world short txt!!")] }), true);
});

test("transcript at or above threshold is not no-show", () => {
  const long = "x".repeat(NO_SHOW_MAX_TRANSCRIPT_CHARS);
  assert.equal(isNoShowCall({ ...base, utterances: [u(long)] }), false);
});

test("multiple utterances sum for threshold", () => {
  const chunk = "ab"; // 2 chars
  const n = Math.ceil((NO_SHOW_MAX_TRANSCRIPT_CHARS + 1) / 2);
  const utterances = Array.from({ length: n }, (_, i) => u(chunk));
  assert.equal(isNoShowCall({ ...base, utterances }), false);
});
