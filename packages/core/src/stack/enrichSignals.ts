import type { ExtractedSignals } from "../extraction/schemas";
import { collectCatalogHits } from "./matchCatalog";

function collectStackTextSnippets(signals: ExtractedSignals): string[] {
  const out: string[] = [];
  if (signals.stack_mentions?.length) {
    for (const m of signals.stack_mentions) {
      if (m.mention?.trim()) out.push(m.mention);
    }
  }
  const acc = signals.account;
  const idp = acc.identity_provider?.value;
  if (typeof idp === "string" && idp !== "unknown") out.push(idp);
  const comp = acc.competitors_mentioned?.value;
  if (Array.isArray(comp)) {
    for (const c of comp) {
      if (typeof c === "string" && c.trim()) out.push(c);
    }
  }
  const ts = acc.tech_stack;
  if (ts) {
    for (const key of ["itsm_tool", "mdm_tool", "knowledge_base"] as const) {
      const v = ts[key];
      if (typeof v === "string" && v !== "unknown") out.push(v);
    }
  }
  return out;
}

/**
 * Adds `stack_canonical_hits` from curated catalog matching over stack_mentions,
 * identity_provider, competitors_mentioned, and tech_stack string slots.
 * Does not modify structured booleans or enums from the LLM.
 */
export function enrichExtractedSignalsStackCatalog(signals: ExtractedSignals): ExtractedSignals {
  const snippets = collectStackTextSnippets(signals);
  const stack_canonical_hits = collectCatalogHits(snippets);
  return { ...signals, stack_canonical_hits };
}
