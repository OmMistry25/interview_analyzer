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

const PROMPT_PATH = path.resolve(__dirname, "../prompts/console_use_cases_v2.txt");

function buildProspectSideAttendeesBlock(ctx: MeetingContext): string {
  const lines = [
    "## PROSPECT-SIDE ATTENDEES",
    "Anchor use-case evidence in these speakers' transcript lines when `[Name]:` matches a name below.",
  ];
  if (ctx.externalAttendees.length === 0) {
    lines.push("_(none listed in metadata — prefer first-person customer language: we / our / our team / our users.)_");
  } else {
    for (const a of ctx.externalAttendees) {
      lines.push(`- ${a.name}${a.email ? ` <${a.email}>` : ""}`);
    }
  }
  return lines.join("\n");
}

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
  const sellerNameLower = (context.ourCompany?.trim() || "Console").toLowerCase();

  const userMessage = [
    buildMetadataBlock(context),
    "",
    buildProspectSideAttendeesBlock(context),
    "",
    `Seller product: **${context.ourCompany}** — Do not infer customer use cases solely from sentences that define or ask about this product.`,
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
  const guarded = applyEvidenceGuardToUseCases(validated, utterances, sellerNameLower);
  const rawN = validated.items.length;
  const outN = guarded.items.length;
  if (rawN > 0 && outN === 0) {
    console.warn(
      "  Console use cases: LLM returned label(s) but evidence guard removed all (transcript mismatch or only pitch-style quotes)."
    );
  } else if (rawN > outN) {
    console.warn(`  Console use cases: evidence guard reduced ${rawN} → ${outN} raw label(s).`);
  }
  return {
    schema_version: CONSOLE_USE_CASE_SCHEMA_VERSION,
    items: guarded.items,
  };
}
