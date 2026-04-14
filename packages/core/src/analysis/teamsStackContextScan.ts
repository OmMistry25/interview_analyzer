import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getQualifiedCallIdsLatestEval,
  loadProspectUtterances,
  type ProspectUtterance,
} from "./workflowAutomationProspectScan";

const CONTEXT_WINDOW_CHARS = 100;
const SNIPPET_RADIUS = 90;
const SNIPPET_MAX = 280;
const HIT_INSERT_BATCH = 50;

/** Strong phrases always count (prospect text, NFKC + casefold). */
const STRONG_PHRASE_SOURCE =
  "(?:\\bmicrosoft\\s+teams\\b|\\bms\\s+teams\\b|\\bm365\\s+teams\\b|\\bteams\\s+meeting\\b|\\bteams\\s+call\\b|\\bin\\s+teams\\b|\\bon\\s+teams\\b)";

/** Stack / needs anchors near a bare `teams` token (word boundary). */
const STACK_ANCHOR_SOURCE =
  "\\b(?:slack|zoom|webex|google\\s+meet|meet\\b|migration|migrating|migrate|migrated|integrated|integrate|integration|integrations|stack|stacks|tool|tools|platform|platforms|collaboration|collaborations|conferencing|conference|calendar|calendars|video|videos|chat|chats|vc)\\b";

const ANCHOR_NAMES =
  "slack|zoom|webex|google_meet|meet|migration|migrate|integrate|stack|tool|platform|collaboration|conferencing|conference|calendar|video|chat|vc";

export const SCANNER_VERSION = `teams-prospect-v1:nfkc-casefold;strongPhrases;contextWindow=${CONTEXT_WINDOW_CHARS}ch;anchors=${ANCHOR_NAMES}`;

export type TeamsMatchBreakdown = { phrase: number; context_window: number };

export interface TeamsStackMatchResult {
  hit: boolean;
  mentionCount: number;
  snippets: string[];
  breakdown: TeamsMatchBreakdown;
}

function normalizeForMatch(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

function truncateSnippet(s: string): string {
  const t = s.trim();
  if (t.length <= SNIPPET_MAX) return t;
  return `${t.slice(0, SNIPPET_MAX - 3)}...`;
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    const last = out[out.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function insideIntervals(pos: number, len: number, intervals: [number, number][]): boolean {
  const end = pos + len;
  for (const [s, e] of intervals) {
    if (pos < e && end > s) return true;
  }
  return false;
}

/**
 * Prospect-only joined text: strong Microsoft-Teams phrases, or standalone `teams` within
 * `CONTEXT_WINDOW_CHARS` of a stack/needs anchor (excluding overlaps already counted as phrase).
 */
export function detectTeamsInStackContext(utterances: ProspectUtterance[]): TeamsStackMatchResult {
  const parts = utterances.map((u) => (u.text ?? "").trim()).filter(Boolean);
  if (parts.length === 0) {
    return { hit: false, mentionCount: 0, snippets: [], breakdown: { phrase: 0, context_window: 0 } };
  }

  const joinedRaw = parts.join(" ");
  const haystack = normalizeForMatch(joinedRaw);

  const strongRe = new RegExp(STRONG_PHRASE_SOURCE, "gi");
  const phraseIntervals: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = strongRe.exec(haystack)) != null) {
    phraseIntervals.push([m.index, m.index + m[0].length]);
  }
  const mergedStrong = mergeIntervals(phraseIntervals);
  const phraseCount = phraseIntervals.length;

  const teamsRe = /\bteams\b/gi;
  const anchorRe = new RegExp(STACK_ANCHOR_SOURCE, "gi");
  let contextCount = 0;
  while ((m = teamsRe.exec(haystack)) != null) {
    if (insideIntervals(m.index, m[0].length, mergedStrong)) continue;
    const from = Math.max(0, m.index - CONTEXT_WINDOW_CHARS);
    const to = Math.min(haystack.length, m.index + m[0].length + CONTEXT_WINDOW_CHARS);
    const windowSlice = haystack.slice(from, to);
    anchorRe.lastIndex = 0;
    if (anchorRe.test(windowSlice)) contextCount++;
  }

  const mentionCount = phraseCount + contextCount;
  const snippets: string[] = [];

  if (mentionCount > 0) {
    const strongRe2 = new RegExp(STRONG_PHRASE_SOURCE, "gi");
    while ((m = strongRe2.exec(haystack)) != null && snippets.length < 3) {
      const from = Math.max(0, m.index - SNIPPET_RADIUS);
      const to = Math.min(haystack.length, m.index + m[0].length + SNIPPET_RADIUS);
      snippets.push(truncateSnippet(haystack.slice(from, to)));
    }
    const teamsRe2 = /\bteams\b/gi;
    const anchorRe2 = new RegExp(STACK_ANCHOR_SOURCE, "gi");
    while ((m = teamsRe2.exec(haystack)) != null && snippets.length < 3) {
      if (insideIntervals(m.index, m[0].length, mergedStrong)) continue;
      const from = Math.max(0, m.index - SNIPPET_RADIUS);
      const to = Math.min(haystack.length, m.index + m[0].length + SNIPPET_RADIUS);
      const windowSlice = haystack.slice(from, to);
      anchorRe2.lastIndex = 0;
      if (!anchorRe2.test(windowSlice)) continue;
      snippets.push(truncateSnippet(haystack.slice(from, to)));
    }
  }

  return {
    hit: mentionCount > 0,
    mentionCount,
    snippets: snippets.slice(0, 3),
    breakdown: { phrase: phraseCount, context_window: contextCount },
  };
}

export async function getFathomCallIdsOrdered(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("calls")
    .select("id")
    .eq("source", "fathom")
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

export type TeamsScanPopulation = "all_fathom" | "qualified_only";

export async function runTeamsMentionScan(
  db: SupabaseClient,
  options: { population: TeamsScanPopulation }
): Promise<{
  runId: string;
  inputCallCount: number;
  scannedCount: number;
  hitCount: number;
  hitCallIds: string[];
}> {
  const callIds =
    options.population === "qualified_only"
      ? await getQualifiedCallIdsLatestEval(db)
      : await getFathomCallIdsOrdered(db);

  const inputCallCount = callIds.length;

  const { data: runRow, error: runErr } = await db
    .from("teams_mention_scan_runs")
    .insert({
      status: "running",
      population: options.population,
      input_call_count: inputCallCount,
      scanned_count: 0,
      hit_count: 0,
      scanner_version: SCANNER_VERSION,
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    throw runErr ?? new Error("Failed to create teams mention scan run");
  }

  const runId = runRow.id as string;
  let scannedCount = 0;
  let hitCount = 0;

  try {
    const hitRows: {
      run_id: string;
      call_id: string;
      snippets: string[];
      mention_count: number;
      match_breakdown: TeamsMatchBreakdown;
    }[] = [];

    for (const callId of callIds) {
      const prospectUtts = await loadProspectUtterances(db, callId);
      const result = detectTeamsInStackContext(prospectUtts);
      scannedCount++;
      if (result.hit && result.mentionCount > 0) {
        hitCount++;
        hitRows.push({
          run_id: runId,
          call_id: callId,
          snippets: result.snippets,
          mention_count: result.mentionCount,
          match_breakdown: result.breakdown,
        });
      }
    }

    for (let i = 0; i < hitRows.length; i += HIT_INSERT_BATCH) {
      const batch = hitRows.slice(i, i + HIT_INSERT_BATCH);
      const { error: hitsErr } = await db.from("teams_mention_scan_hits").insert(batch);
      if (hitsErr) throw hitsErr;
    }

    const { error: finErr } = await db
      .from("teams_mention_scan_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        scanned_count: scannedCount,
        hit_count: hitCount,
      })
      .eq("id", runId);

    if (finErr) throw finErr;

    return {
      runId,
      inputCallCount,
      scannedCount,
      hitCount,
      hitCallIds: hitRows.map((h) => h.call_id),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("teams_mention_scan_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: msg,
        scanned_count: scannedCount,
        hit_count: hitCount,
      })
      .eq("id", runId);
    throw err;
  }
}
