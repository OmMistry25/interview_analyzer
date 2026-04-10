import type { NormalizedUtterance } from "../types/normalized";
import type { ConsoleUseCasesLlmOutput } from "./schemas";

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[""'']/g, '"')
    .trim();
}

/** Full transcript text for substring checks (normalized utterances). */
export function buildTranscriptMatchBlob(utterances: NormalizedUtterance[]): string {
  return normalizeForMatch(utterances.map((u) => u.textNormalized).join("\n"));
}

/** Keep evidence quotes that appear as substrings of the transcript blob (case/whitespace tolerant). */
export function filterEvidenceAgainstTranscript(
  evidence: string[],
  transcriptBlob: string
): string[] {
  const blob = transcriptBlob;
  return evidence.filter((q) => {
    const n = normalizeForMatch(q);
    return n.length >= 8 && blob.includes(n);
  });
}

/**
 * Drop items with no surviving evidence; merge duplicate ids (union evidence, keep higher confidence).
 */
export function applyEvidenceGuardToUseCases(
  parsed: ConsoleUseCasesLlmOutput,
  utterances: NormalizedUtterance[]
): ConsoleUseCasesLlmOutput {
  const blob = buildTranscriptMatchBlob(utterances);
  const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };

  const byId = new Map<
    string,
    { id: string; confidence: "high" | "medium" | "low"; evidence: Set<string>; summary?: string }
  >();

  for (const item of parsed.items) {
    const kept = filterEvidenceAgainstTranscript(item.evidence, blob);
    if (kept.length === 0) continue;

    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, {
        id: item.id,
        confidence: item.confidence,
        evidence: new Set(kept),
        summary: item.summary,
      });
      continue;
    }

    for (const e of kept) existing.evidence.add(e);
    if (rank[item.confidence] > rank[existing.confidence]) {
      existing.confidence = item.confidence;
    }
    if (item.summary && !existing.summary) {
      existing.summary = item.summary;
    }
  }

  return {
    items: [...byId.values()].map((v) => ({
      id: v.id as ConsoleUseCasesLlmOutput["items"][number]["id"],
      confidence: v.confidence,
      evidence: [...v.evidence],
      summary: v.summary,
    })),
  };
}
