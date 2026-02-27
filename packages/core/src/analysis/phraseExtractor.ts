import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { phraseExtractionResultSchema, PhraseExtractionResult } from "./schemas";

const PROMPT_PATH = path.resolve(__dirname, "../prompts/phrase_extractor_v1.txt");

interface ProspectUtterance {
  speakerLabel: string;
  text: string;
}

function buildProspectTranscript(utterances: ProspectUtterance[]): string {
  const lines = utterances.map((u) => `[${u.speakerLabel}]: ${u.text}`);
  return "## PROSPECT TRANSCRIPT\n" + lines.join("\n");
}

export async function extractPhrases(
  utterances: ProspectUtterance[],
  model = "gpt-4o"
): Promise<PhraseExtractionResult> {
  if (utterances.length === 0) {
    return {
      problem_descriptions: [],
      solution_seeking: [],
      pain_language: [],
      feature_mentions: [],
      search_intent: [],
    };
  }

  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildProspectTranscript(utterances);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from phrase extractor LLM");

  const parsed = JSON.parse(content);
  return phraseExtractionResultSchema.parse(parsed);
}
