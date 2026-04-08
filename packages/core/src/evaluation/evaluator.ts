import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { evaluationSchema, EvaluationResult } from "./schemas";
import { ExtractedSignals } from "../extraction/schemas";
import type { DealBrief } from "../dealBrief/schemas";
import { MeetingContext } from "../types/normalized";

const PROMPT_PATH = path.resolve(__dirname, "../prompts/evaluator_v3.txt");

export async function evaluateSignals(
  signals: ExtractedSignals,
  context: MeetingContext,
  model = "gpt-4o",
  dealBrief?: DealBrief | null
): Promise<EvaluationResult> {
  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");

  const briefBlock =
    dealBrief != null
      ? [
          "## AE DEAL BRIEF (synthesized from transcript; cross-check against EXTRACTED SIGNALS)",
          JSON.stringify(dealBrief, null, 2),
          "",
        ].join("\n")
      : "";

  const userMessage = [
    "## EXTRACTED SIGNALS",
    JSON.stringify(signals, null, 2),
    "",
    briefBlock,
    "## MEETING CONTEXT",
    `Our company: ${context.ourCompany}`,
    `Prospect company: ${context.prospectCompany ?? "Unknown"}`,
    `Deal segment: ${context.dealSegment}`,
    `Meeting title: ${context.meetingTitle}`,
    `Internal attendees: ${context.internalAttendees.map((a) => a.name).join(", ") || "None listed"}`,
    `External attendees: ${context.externalAttendees.map((a) => a.name).join(", ") || "None listed"}`,
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
  if (!content) throw new Error("Empty response from evaluator LLM");

  const parsed = JSON.parse(content);
  const validated = evaluationSchema.parse(parsed);

  return validated;
}
