import type { NormalizedCall } from "../types/normalized";

/**
 * Heuristic: Fathom does not expose a dedicated no-show flag. Treat empty or
 * negligible transcript as no-show (e.g. no prospect conversation to analyze).
 */
export const NO_SHOW_MAX_TRANSCRIPT_CHARS = 60;

export function isNoShowCall(call: NormalizedCall): boolean {
  if (call.utterances.length === 0) return true;
  let total = 0;
  for (const u of call.utterances) {
    total += u.textNormalized.trim().length;
  }
  return total < NO_SHOW_MAX_TRANSCRIPT_CHARS;
}
