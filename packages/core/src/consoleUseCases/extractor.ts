import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { buildMetadataBlock, buildTranscriptBlock } from "../extraction/extractor";
import type { ExtractedSignals } from "../extraction/schemas";
import type { MeetingContext, NormalizedUtterance } from "../types/normalized";
import { applyEvidenceGuardToUseCases } from "./evidenceGuard";
import {
  CONSOLE_USE_CASE_SCHEMA_VERSION,
  consoleUseCasesLlmOutputSchema,
  type ConsoleUseCasesDocument,
} from "./schemas";

const PROMPT_PATH = path.resolve(__dirname, "../prompts/console_use_cases_v1.txt");

const JSON_SHAPE = `{
  "items": [
    {
      "id": string,
      "confidence": "high" | "medium" | "low",
      "evidence": string[],
      "summary": string (optional, one short clause)
    }
  ]
}`;

export async function extractConsoleUseCases(
  utterances: NormalizedUtterance[],
  context: MeetingContext,
  signals: ExtractedSignals,
  model = "gpt-4o"
): Promise<ConsoleUseCasesDocument> {
  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = [
    buildMetadataBlock(context),
    "",
    buildTranscriptBlock(utterances),
    "",
    "## STRUCTURED_SIGNALS (hints only; every use case must still be grounded in transcript quotes)",
    JSON.stringify(signals, null, 2),
    "",
    "## REQUIRED JSON SHAPE",
    JSON_SHAPE,
    "",
    `Return at most 5 items. schema_version is filled server-side; omit it from your JSON.`,
  ].join("\n");

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
  if (!content) throw new Error("Empty response from console use cases LLM");

  const parsed = JSON.parse(content);
  const validated = consoleUseCasesLlmOutputSchema.parse(parsed);
  const guarded = applyEvidenceGuardToUseCases(validated, utterances);
  return {
    schema_version: CONSOLE_USE_CASE_SCHEMA_VERSION,
    items: guarded.items,
  };
}
