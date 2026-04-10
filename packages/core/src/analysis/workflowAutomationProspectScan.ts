import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lexical scan: prospect utterances only; both \\bworkflow\\b and \\bautomation\\b (NFKC + lowercase).
 * Same utterance: any distance. Across consecutive prospect lines: merge 2–3 adjacent rows; token-start
 * distance between the two lemmas must be ≤120 chars.
 */
export const SCANNER_VERSION =
  "wa-prospect-v1:nfkc-lowercase;single-utterance-any-distance;adjacent-2-3-prospect-lines;max120chars-between-token-starts";

export type ProspectUtterance = { text: string; speakerLabel: string };

const SNIPPET_MAX = 280;
const MULTI_WINDOW_CHAR_GAP = 120;
const HIT_INSERT_BATCH = 50;

function normalizeForMatch(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

function hasWordWorkflow(lower: string): boolean {
  return /\bworkflow\b/.test(lower);
}

function hasWordAutomation(lower: string): boolean {
  return /\bautomation\b/.test(lower);
}

function truncateSnippet(s: string): string {
  const t = s.trim();
  if (t.length <= SNIPPET_MAX) return t;
  return `${t.slice(0, SNIPPET_MAX - 3)}...`;
}

/** Minimum |start(workflow) - start(automation)| over all lemma occurrences. */
function minTokenStartDistance(lower: string): number | null {
  const wStarts: number[] = [];
  const aStarts: number[] = [];
  const wRe = /\bworkflow\b/g;
  const aRe = /\bautomation\b/g;
  let m: RegExpExecArray | null;
  while ((m = wRe.exec(lower)) != null) wStarts.push(m.index);
  while ((m = aRe.exec(lower)) != null) aStarts.push(m.index);
  if (wStarts.length === 0 || aStarts.length === 0) return null;
  let min = Infinity;
  for (const wi of wStarts) {
    for (const ai of aStarts) {
      const d = Math.abs(wi - ai);
      if (d < min) min = d;
    }
  }
  return min === Infinity ? null : min;
}

function bothInSameUtterance(raw: string): boolean {
  const lower = normalizeForMatch(raw);
  return hasWordWorkflow(lower) && hasWordAutomation(lower);
}

function bothInMergedWindow(rawMerged: string): boolean {
  const lower = normalizeForMatch(rawMerged);
  if (!hasWordWorkflow(lower) || !hasWordAutomation(lower)) return false;
  const dist = minTokenStartDistance(lower);
  if (dist == null) return false;
  return dist <= MULTI_WINDOW_CHAR_GAP;
}

export function prospectTextMentionsWorkflowAndAutomation(
  utterances: ProspectUtterance[]
): { hit: boolean; snippets: string[] } {
  const snippets: string[] = [];

  for (const u of utterances) {
    const raw = u.text ?? "";
    if (!raw.trim()) continue;
    if (bothInSameUtterance(raw)) {
      snippets.push(truncateSnippet(raw));
      if (snippets.length >= 3) return { hit: true, snippets };
    }
  }

  if (snippets.length > 0) {
    return { hit: true, snippets: snippets.slice(0, 3) };
  }

  if (utterances.length < 2) {
    return { hit: false, snippets: [] };
  }

  const maxW = Math.min(3, utterances.length);
  for (let w = 2; w <= maxW; w++) {
    for (let i = 0; i + w <= utterances.length; i++) {
      const slice = utterances.slice(i, i + w);
      const parts = slice.map((u) => (u.text ?? "").trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const merged = parts.join(" ");
      if (bothInMergedWindow(merged)) {
        snippets.push(truncateSnippet(merged));
        if (snippets.length >= 3) return { hit: true, snippets };
      }
    }
  }

  return { hit: snippets.length > 0, snippets: snippets.slice(0, 3) };
}

export async function loadProspectUtterances(
  db: SupabaseClient,
  callId: string
): Promise<ProspectUtterance[]> {
  const { data: participants, error: pErr } = await db
    .from("participants")
    .select("id, name")
    .eq("call_id", callId)
    .eq("role", "prospect");

  if (pErr) throw pErr;

  const prospectIds = new Set((participants ?? []).map((p) => p.id));
  const prospectNames = new Map((participants ?? []).map((p) => [p.id, p.name as string]));

  if (prospectIds.size === 0) return [];

  const { data: utterances, error: uErr } = await db
    .from("utterances")
    .select("speaker_participant_id, speaker_label_raw, text_normalized")
    .eq("call_id", callId)
    .order("idx", { ascending: true });

  if (uErr) throw uErr;

  return (utterances ?? [])
    .filter((u) => u.speaker_participant_id && prospectIds.has(u.speaker_participant_id))
    .map((u) => ({
      speakerLabel: String(prospectNames.get(u.speaker_participant_id) ?? u.speaker_label_raw ?? ""),
      text: (u.text_normalized as string) ?? "",
    }));
}

/**
 * Qualified calls = those whose latest evaluation row (by `created_at`) has `overall_status === 'Qualified'`.
 */
export async function getQualifiedCallIdsLatestEval(db: SupabaseClient): Promise<string[]> {
  const { data: rows, error } = await db
    .from("evaluations")
    .select("call_id, overall_status, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const latestStatus = new Map<string, string>();
  for (const row of rows ?? []) {
    const cid = row.call_id as string;
    if (!latestStatus.has(cid)) {
      latestStatus.set(cid, String(row.overall_status ?? ""));
    }
  }

  return [...latestStatus.entries()]
    .filter(([, status]) => status === "Qualified")
    .map(([cid]) => cid);
}

export async function runQualifiedWorkflowAutomationScan(db: SupabaseClient): Promise<{
  runId: string;
  qualifiedCallCount: number;
  scannedCount: number;
  hitCount: number;
}> {
  const qualifiedCallIds = await getQualifiedCallIdsLatestEval(db);
  const qualifiedCallCount = qualifiedCallIds.length;

  const { data: runRow, error: runErr } = await db
    .from("workflow_automation_scan_runs")
    .insert({
      status: "running",
      qualified_call_count: qualifiedCallCount,
      scanned_count: 0,
      hit_count: 0,
      scanner_version: SCANNER_VERSION,
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    throw runErr ?? new Error("Failed to create workflow automation scan run");
  }

  const runId = runRow.id as string;
  let scannedCount = 0;
  let hitCount = 0;

  try {
    const hitRows: { run_id: string; call_id: string; snippets: string[] }[] = [];

    for (const callId of qualifiedCallIds) {
      const prospectUtts = await loadProspectUtterances(db, callId);
      const { hit, snippets } = prospectTextMentionsWorkflowAndAutomation(prospectUtts);
      scannedCount++;
      if (hit && snippets.length > 0) {
        hitCount++;
        hitRows.push({ run_id: runId, call_id: callId, snippets });
      }
    }

    for (let i = 0; i < hitRows.length; i += HIT_INSERT_BATCH) {
      const batch = hitRows.slice(i, i + HIT_INSERT_BATCH);
      const { error: hitsErr } = await db.from("workflow_automation_scan_hits").insert(batch);
      if (hitsErr) throw hitsErr;
    }

    const { error: finErr } = await db
      .from("workflow_automation_scan_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        scanned_count: scannedCount,
        hit_count: hitCount,
      })
      .eq("id", runId);

    if (finErr) throw finErr;

    return { runId, qualifiedCallCount, scannedCount, hitCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("workflow_automation_scan_runs")
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
