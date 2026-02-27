import { z } from "zod";

const extractedPhraseSchema = z.object({
  phrase: z.string(),
  verbatim_quote: z.string(),
  speaker: z.string(),
  context_summary: z.string(),
});

export const phraseExtractionResultSchema = z.object({
  problem_descriptions: z.array(extractedPhraseSchema),
  solution_seeking: z.array(extractedPhraseSchema),
  pain_language: z.array(extractedPhraseSchema),
  feature_mentions: z.array(extractedPhraseSchema),
  search_intent: z.array(extractedPhraseSchema),
});

export type ExtractedPhrase = z.infer<typeof extractedPhraseSchema>;
export type PhraseExtractionResult = z.infer<typeof phraseExtractionResultSchema>;

export const PHRASE_CATEGORIES = [
  "problem_descriptions",
  "solution_seeking",
  "pain_language",
  "feature_mentions",
  "search_intent",
] as const;

export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];
