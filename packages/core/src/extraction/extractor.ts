import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { extractedSignalsSchema, ExtractedSignals } from "./schemas";
import { NormalizedUtterance, MeetingContext } from "../types/normalized";

const PROMPT_PATH = path.resolve(__dirname, "../prompts/extractor_v3.txt");

function buildMetadataBlock(ctx: MeetingContext): string {
  const lines: string[] = [
    "## MEETING METADATA",
    `Meeting title: ${ctx.meetingTitle}`,
    `Our company (seller): ${ctx.ourCompany}`,
    `Prospect company: ${ctx.prospectCompany ?? "Unknown (extract from transcript)"}`,
  ];

  if (ctx.internalAttendees.length > 0) {
    lines.push("Internal attendees (our team):");
    for (const a of ctx.internalAttendees) {
      lines.push(`  - ${a.name}${a.email ? ` <${a.email}>` : ""}`);
    }
  }

  if (ctx.externalAttendees.length > 0) {
    lines.push("External attendees (prospect side):");
    for (const a of ctx.externalAttendees) {
      lines.push(`  - ${a.name}${a.email ? ` <${a.email}>` : ""}`);
    }
  }

  return lines.join("\n");
}

function buildTranscriptBlock(utterances: NormalizedUtterance[]): string {
  const lines = utterances.map((u) => `[${u.speakerLabelRaw}]: ${u.textNormalized}`);
  return "## TRANSCRIPT\n" + lines.join("\n");
}

export async function extractSignals(
  utterances: NormalizedUtterance[],
  context: MeetingContext,
  model = "gpt-4o"
): Promise<ExtractedSignals> {
  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildMetadataBlock(context) + "\n\n" + buildTranscriptBlock(utterances);

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
  if (!content) throw new Error("Empty response from extractor LLM");

  const parsed = JSON.parse(content);
  const validated = extractedSignalsSchema.parse(parsed);

  return validated;
}
