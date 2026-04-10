import { z } from "zod";
import { CONSOLE_USE_CASE_IDS, type ConsoleUseCaseId } from "./taxonomy";

export const CONSOLE_USE_CASE_SCHEMA_VERSION = 1 as const;

const useCaseIdSchema = z.enum(CONSOLE_USE_CASE_IDS);

const consoleUseCaseItemSchema = z.object({
  id: useCaseIdSchema,
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.array(z.string()).min(1),
  summary: z.string().optional(),
});

export const consoleUseCasesLlmOutputSchema = z.object({
  items: z.array(consoleUseCaseItemSchema).max(5),
});

export type ConsoleUseCasesLlmOutput = z.infer<typeof consoleUseCasesLlmOutputSchema>;

const skippedReasonSchema = z.enum(["no_show", "pipeline_disabled"]);

export const consoleUseCasesDocumentSchema = z.object({
  schema_version: z.literal(CONSOLE_USE_CASE_SCHEMA_VERSION),
  items: z.array(consoleUseCaseItemSchema),
  skipped_reason: skippedReasonSchema.optional(),
});

export type ConsoleUseCasesDocument = z.infer<typeof consoleUseCasesDocumentSchema>;

export type { ConsoleUseCaseId };

export function buildSkippedConsoleUseCases(
  reason: z.infer<typeof skippedReasonSchema>
): ConsoleUseCasesDocument {
  return {
    schema_version: CONSOLE_USE_CASE_SCHEMA_VERSION,
    items: [],
    skipped_reason: reason,
  };
}
