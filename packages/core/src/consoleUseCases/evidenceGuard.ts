import type { NormalizedUtterance } from "../types/normalized";
import type { ConsoleUseCasesLlmOutput } from "./schemas";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** First word of seller name for word-boundary patterns (e.g. "Console Inc" → "console"). */
function primarySellerToken(sellerNameLower: string): string {
  const t = sellerNameLower.trim().toLowerCase().split(/\s+/).filter(Boolean)[0] ?? "console";
  return t.length >= 2 ? t : "console";
}

/**
 * Drop evidence that is primarily a vendor-definition / product-pitch line about the seller.
 * Important: do **not** drop every `{seller} is` — that removes legitimate customer lines
 * ("whether Console is compatible with our stack"). Only drop classic definitional/pitch shapes.
 */
export function filterVendorDefinitionEvidence(
  quotes: string[],
  sellerNameLower: string
): string[] {
  const seller = primarySellerToken(sellerNameLower);
  const esc = escapeRegExp(seller);

  /** "Console is an AI …", "Console is a co-worker …" style pitch (not "Console is compatible"). */
  const definitionalPitch = new RegExp(
    `\\b${esc}\\s+is\\s+` +
      `(an?\\s+ai\\b|an?\\s+artificial\\b|a\\s+co-?worker\\b|an?\\s+.*?\\bco-?worker\\b|a\\s+.*?\\bco-?worker\\b)`,
    "i"
  );

  return quotes.filter((q) => {
    const n = normalizeForMatch(q);
    const mentionsSeller = new RegExp(`\\b${esc}\\b`, "i").test(n);
    if (!mentionsSeller) return true;

    if (definitionalPitch.test(n)) return false;
    if (new RegExp(`\\bwhat(\\s+does)?\\s+${esc}\\b`, "i").test(n)) return false;
    if (new RegExp(`\\b${esc}\\s+(does|can|will|helps?)\\b`, "i").test(n)) return false;

    return true;
  });
}

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
 * @param sellerNameLower - `MeetingContext.ourCompany` (lowercase); defaults to `console` when empty.
 */
export function applyEvidenceGuardToUseCases(
  parsed: ConsoleUseCasesLlmOutput,
  utterances: NormalizedUtterance[],
  sellerNameLower = "console"
): ConsoleUseCasesLlmOutput {
  const blob = buildTranscriptMatchBlob(utterances);
  const seller = sellerNameLower.trim() || "console";
  const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };

  const byId = new Map<
    string,
    { id: string; confidence: "high" | "medium" | "low"; evidence: Set<string>; summary?: string }
  >();

  for (const item of parsed.items) {
    const inTranscript = filterEvidenceAgainstTranscript(item.evidence, blob);
    const kept = filterVendorDefinitionEvidence(inTranscript, seller);
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
