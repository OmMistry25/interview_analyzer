import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { extractedSignalsSchema, ExtractedSignals } from "./schemas";
import { NormalizedUtterance } from "../types/normalized";

const PROMPT_PATH = path.resolve(__dirname, "../prompts/extractor_v1.txt");

function buildTranscriptText(utterances: NormalizedUtterance[]): string {
  return utterances
    .map((u) => `[${u.speakerLabelRaw}]: ${u.textNormalized}`)
    .join("\n");
}

export async function extractSignals(
  utterances: NormalizedUtterance[],
  model = "gpt-4o"
): Promise<ExtractedSignals> {
  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  const transcriptText = buildTranscriptText(utterances);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcriptText },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from extractor LLM");

  const parsed = JSON.parse(content);
  const validated = extractedSignalsSchema.parse(parsed);

  return validated;
}
