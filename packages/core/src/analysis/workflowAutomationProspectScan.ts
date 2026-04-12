import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lexical scan: prospect utterances only. Counts **adjacent** English phrases only:
 * `workflow` + whitespace + `automation`, or `workflow-automation` (NFKC-normalized text, case-insensitive).
 * Words may not appear in reverse order or with other words between. Prospect lines are joined in order
 * with a single space so a phrase split across consecutive prospect turns still matches.
 */
export const SCANNER_VERSION =
  "wa-prospect-v2:nfkc-casefold;adjacent-phrase-only;workflow[-\\s]+automation-order;joined-prospect-lines";

export type ProspectUtterance = { text: string; speakerLabel: string };

const SNIPPET_MAX = 280;
const SNIPPET_RADIUS = 90;
const HIT_INSERT_BATCH = 50;

/** Hyphen or whitespace only between the two words (no other tokens). Order: workflow → automation. */
const WORKFLOW_AUTOMATION_PHRASE_SOURCE = "(?:\\bworkflow-automation\\b|\\bworkflow\\s+automation\\b)";

function normalizeForMatch(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

function truncateSnippet(s: string): string {
  const t = s.trim();
  if (t.length <= SNIPPET_MAX) return t;
  return `${t.slice(0, SNIPPET_MAX - 3)}...`;
}

/**
 * Join consecutive prospect utterances (transcript order) and count non-overlapping phrase matches.
 */
export function prospectTextMentionsWorkflowAndAutomation(utterances: ProspectUtterance[]): {
  hit: boolean;
  snippets: string[];
  phraseMentionCount: number;
} {
  const parts = utterances.map((u) => (u.text ?? "").trim()).filter(Boolean);
  if (parts.length === 0) {
    return { hit: false, snippets: [], phraseMentionCount: 0 };
  }

  const joinedRaw = parts.join(" ");
  const haystack = normalizeForMatch(joinedRaw);
  const re = new RegExp(WORKFLOW_AUTOMATION_PHRASE_SOURCE, "gi");
  const snippets: string[] = [];
  let phraseMentionCount = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack)) != null) {
    phraseMentionCount++;
    if (snippets.length < 3) {
      const start = m.index;
      const end = start + m[0].length;
      const from = Math.max(0, start - SNIPPET_RADIUS);
      const to = Math.min(haystack.length, end + SNIPPET_RADIUS);
      snippets.push(truncateSnippet(haystack.slice(from, to)));
    }
  }

  return {
    hit: phraseMentionCount > 0,
    snippets,
    phraseMentionCount,
  };
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
    const hitRows: {
      run_id: string;
      call_id: string;
      snippets: string[];
      phrase_mention_count: number;
    }[] = [];

    for (const callId of qualifiedCallIds) {
      const prospectUtts = await loadProspectUtterances(db, callId);
      const { hit, snippets, phraseMentionCount } =
        prospectTextMentionsWorkflowAndAutomation(prospectUtts);
      scannedCount++;
      if (hit && phraseMentionCount > 0) {
        hitCount++;
        hitRows.push({
          run_id: runId,
          call_id: callId,
          snippets,
          phrase_mention_count: phraseMentionCount,
        });
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
