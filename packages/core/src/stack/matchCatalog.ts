import { STACK_CATALOG, type StackCatalogEntry } from "./catalog";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhrase(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

const wordChar = (c: string) => /[a-z0-9]/.test(c);

function phraseMatch(haystackNorm: string, aliasNorm: string): boolean {
  if (aliasNorm.length < 2) return false;
  let idx = 0;
  while ((idx = haystackNorm.indexOf(aliasNorm, idx)) !== -1) {
    const before = idx > 0 ? haystackNorm[idx - 1]! : " ";
    const after = idx + aliasNorm.length < haystackNorm.length ? haystackNorm[idx + aliasNorm.length]! : " ";
    if (!wordChar(before) && !wordChar(after)) return true;
    idx += 1;
  }
  return false;
}

/** True if `alias` matches inside `haystack` with safe boundaries (reduces substring false positives). */
export function textMatchesAlias(haystack: string, alias: string): boolean {
  const h = normalizePhrase(haystack);
  const a = normalizePhrase(alias);
  if (a.length < 2) return false;
  if (a.includes(" ")) return phraseMatch(h, a);
  if (a.length <= 4) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(a)}($|[^a-z0-9])`, "i");
    return re.test(h);
  }
  return phraseMatch(h, a);
}

function entryMatchesText(entry: StackCatalogEntry, haystack: string): boolean {
  return entry.aliases.some((alias) => textMatchesAlias(haystack, alias));
}

/** All catalog ids that match any snippet (deduped, stable order by category then label). */
export function collectCatalogHits(snippets: string[]): string[] {
  const hits = new Set<string>();
  for (const raw of snippets) {
    if (!raw || typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s || s === "unknown") continue;
    for (const entry of STACK_CATALOG) {
      if (entryMatchesText(entry, s)) hits.add(entry.id);
    }
  }
  const order = new Map(STACK_CATALOG.map((e, i) => [e.id, i]));
  return [...hits].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
