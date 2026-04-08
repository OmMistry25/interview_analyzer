import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { buildMetadataBlock, buildTranscriptBlock } from "../extraction/extractor";
import type { ExtractedSignals } from "../extraction/schemas";
import type { MeetingContext, NormalizedUtterance } from "../types/normalized";
import { dealBriefSchema, type DealBrief } from "./schemas";

const PROMPT_PATH = path.resolve(__dirname, "../prompts/deal_brief_v1.txt");

const JSON_SHAPE = `{
  "contacts": [{ "name": string, "role_summary": string, "evidence": string[] }],
  "stack": { "summary": string, "tools": string[], "evidence": string[] },
  "catalyst_why_now": { "summary": string, "evidence": string[] },
  "scope_and_intake": { "summary": string, "evidence": string[] },
  "pain_points": [{ "summary": string, "evidence": string[] }],
  "what_they_want_next": string[],
  "parallel_tracks": string[],
  "discovery": { "summary": string, "evidence": string[] },
  "next_steps": { "summary": string, "evidence": string[] }
}`;

export async function extractDealBrief(
  utterances: NormalizedUtterance[],
  context: MeetingContext,
  signals: ExtractedSignals,
  model = "gpt-4o"
): Promise<DealBrief> {
  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = [
    buildMetadataBlock(context),
    "",
    buildTranscriptBlock(utterances),
    "",
    "## STRUCTURED SIGNALS (verify each item against transcript; do not copy mistakes)",
    JSON.stringify(signals, null, 2),
    "",
    "## REQUIRED JSON SHAPE",
    JSON_SHAPE,
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
  if (!content) throw new Error("Empty response from deal brief LLM");

  const parsed = JSON.parse(content);
  return dealBriefSchema.parse(parsed);
}
