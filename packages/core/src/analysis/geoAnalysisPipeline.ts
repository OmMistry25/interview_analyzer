import { SupabaseClient } from "@supabase/supabase-js";
import { fetchStageZeroDeals, matchDealsToCallIds } from "../enrichment/hubspot";
import { extractPhrases } from "./phraseExtractor";
import { PHRASE_CATEGORIES, PhraseCategory, PhraseExtractionResult, ExtractedPhrase } from "./schemas";

const PROMPT_VERSION = "phrase_extractor_v1";
const MODEL = "gpt-4o";

// ── Run management ──────────────────────────────────────────────

export async function createGeoAnalysisRun(
  db: SupabaseClient,
  type: "daily_extraction" | "weekly_analysis" | "backfill",
  config: Record<string, unknown> = {}
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("geo_analysis_runs")
    .insert({ type, status: "running", config })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function markGeoRunSucceeded(
  db: SupabaseClient,
  runId: string,
  callsProcessed: number
): Promise<void> {
  const { error } = await db
    .from("geo_analysis_runs")
    .update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      calls_processed: callsProcessed,
    })
    .eq("id", runId);
  if (error) throw error;
}

export async function markGeoRunFailed(
  db: SupabaseClient,
  runId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await db
    .from("geo_analysis_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq("id", runId);
  if (error) throw error;
}

// ── Daily extraction ────────────────────────────────────────────

export async function runDailyExtraction(
  db: SupabaseClient,
  config: { hubspotPipelineId: string; hubspotStageId: string }
): Promise<{ runId: string; callsProcessed: number }> {
  const run = await createGeoAnalysisRun(db, "daily_extraction", config);

  try {
    const deals = await fetchStageZeroDeals(config.hubspotPipelineId, config.hubspotStageId);
    console.log(`  [GEO] Found ${deals.length} stage 0 deals in HubSpot`);

    const matchedCallIds = await matchDealsToCallIds(db, deals);
    console.log(`  [GEO] Matched ${matchedCallIds.length} calls`);

    const unprocessedCallIds = await filterUnprocessedCalls(db, matchedCallIds);
    console.log(`  [GEO] ${unprocessedCallIds.length} calls need processing`);

    let processed = 0;
    for (const callId of unprocessedCallIds) {
      try {
        await extractPhrasesForCall(db, run.id, callId);
        processed++;
        console.log(`  [GEO] Processed call ${callId} (${processed}/${unprocessedCallIds.length})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [GEO] Failed to process call ${callId}: ${msg}`);
      }
    }

    await markGeoRunSucceeded(db, run.id, processed);
    return { runId: run.id, callsProcessed: processed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markGeoRunFailed(db, run.id, msg);
    throw err;
  }
}

export async function runBackfill(
  db: SupabaseClient,
  config: { hubspotPipelineId: string; hubspotStageId: string }
): Promise<{ runId: string; callsProcessed: number }> {
  const run = await createGeoAnalysisRun(db, "backfill", config);

  try {
    const deals = await fetchStageZeroDeals(config.hubspotPipelineId, config.hubspotStageId);
    console.log(`  [GEO Backfill] Found ${deals.length} stage 0 deals in HubSpot`);

    const matchedCallIds = await matchDealsToCallIds(db, deals);
    console.log(`  [GEO Backfill] Matched ${matchedCallIds.length} calls total`);

    const unprocessedCallIds = await filterUnprocessedCalls(db, matchedCallIds);
    console.log(`  [GEO Backfill] ${unprocessedCallIds.length} calls to backfill`);

    let processed = 0;
    for (const callId of unprocessedCallIds) {
      try {
        await extractPhrasesForCall(db, run.id, callId);
        processed++;
        if (processed % 5 === 0) {
          console.log(`  [GEO Backfill] Progress: ${processed}/${unprocessedCallIds.length}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [GEO Backfill] Failed call ${callId}: ${msg}`);
      }
    }

    await markGeoRunSucceeded(db, run.id, processed);
    return { runId: run.id, callsProcessed: processed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markGeoRunFailed(db, run.id, msg);
    throw err;
  }
}

// ── Qualified-only extraction (skips HubSpot, uses evaluation status) ────

export async function runQualifiedExtraction(
  db: SupabaseClient
): Promise<{ runId: string; callsProcessed: number }> {
  const run = await createGeoAnalysisRun(db, "backfill", { filter: "qualified_only" });

  try {
    // Get all call IDs with a "Qualified" evaluation
    const { data: evals } = await db
      .from("evaluations")
      .select("call_id")
      .eq("overall_status", "Qualified");

    const qualifiedCallIds = [...new Set((evals ?? []).map((e) => e.call_id as string))];
    console.log(`  [GEO Qualified] Found ${qualifiedCallIds.length} qualified calls`);

    const unprocessedCallIds = await filterUnprocessedCalls(db, qualifiedCallIds);
    console.log(`  [GEO Qualified] ${unprocessedCallIds.length} need phrase extraction`);

    let processed = 0;
    for (const callId of unprocessedCallIds) {
      try {
        await extractPhrasesForCall(db, run.id, callId);
        processed++;
        console.log(`  [GEO Qualified] Processed ${processed}/${unprocessedCallIds.length}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [GEO Qualified] Failed call ${callId}: ${msg}`);
      }
    }

    await markGeoRunSucceeded(db, run.id, processed);
    return { runId: run.id, callsProcessed: processed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markGeoRunFailed(db, run.id, msg);
    throw err;
  }
}

async function filterUnprocessedCalls(
  db: SupabaseClient,
  callIds: string[]
): Promise<string[]> {
  if (callIds.length === 0) return [];

  // Batch .in() queries to avoid PostgREST URL length limits
  const BATCH_SIZE = 50;
  const processed = new Set<string>();

  for (let i = 0; i < callIds.length; i += BATCH_SIZE) {
    const batch = callIds.slice(i, i + BATCH_SIZE);
    const { data: existing } = await db
      .from("call_phrase_extractions")
      .select("call_id")
      .in("call_id", batch);

    for (const e of existing ?? []) {
      processed.add(e.call_id);
    }
  }

  return callIds.filter((id) => !processed.has(id));
}

async function extractPhrasesForCall(
  db: SupabaseClient,
  runId: string,
  callId: string
): Promise<void> {
  // Fetch prospect utterances only
  const { data: participants } = await db
    .from("participants")
    .select("id, name")
    .eq("call_id", callId)
    .eq("role", "prospect");

  const prospectIds = new Set((participants ?? []).map((p) => p.id));
  const prospectNames = new Map((participants ?? []).map((p) => [p.id, p.name as string]));

  if (prospectIds.size === 0) {
    // No prospect participants identified — store empty result
    await persistPhraseExtraction(db, runId, callId, {
      problem_descriptions: [],
      solution_seeking: [],
      pain_language: [],
      feature_mentions: [],
      search_intent: [],
    });
    return;
  }

  const { data: utterances } = await db
    .from("utterances")
    .select("speaker_participant_id, speaker_label_raw, text_normalized")
    .eq("call_id", callId)
    .order("idx", { ascending: true });

  const prospectUtterances = (utterances ?? [])
    .filter((u) => u.speaker_participant_id && prospectIds.has(u.speaker_participant_id))
    .map((u) => ({
      speakerLabel: prospectNames.get(u.speaker_participant_id) ?? u.speaker_label_raw,
      text: u.text_normalized as string,
    }));

  if (prospectUtterances.length === 0) {
    await persistPhraseExtraction(db, runId, callId, {
      problem_descriptions: [],
      solution_seeking: [],
      pain_language: [],
      feature_mentions: [],
      search_intent: [],
    });
    return;
  }

  const result = await extractPhrases(prospectUtterances, MODEL);
  await persistPhraseExtraction(db, runId, callId, result);
}

async function persistPhraseExtraction(
  db: SupabaseClient,
  runId: string,
  callId: string,
  phrases: PhraseExtractionResult
): Promise<void> {
  const { error } = await db.from("call_phrase_extractions").insert({
    call_id: callId,
    run_id: runId,
    phrases_json: phrases,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
  });
  if (error) throw error;
}

// ── Weekly analysis ─────────────────────────────────────────────

export async function runWeeklyAnalysis(
  db: SupabaseClient
): Promise<{ runId: string; uniquePhrases: number }> {
  const run = await createGeoAnalysisRun(db, "weekly_analysis");

  try {
    // Get date range for current week (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    // Fetch all phrase extractions from this week
    const { data: extractions } = await db
      .from("call_phrase_extractions")
      .select("call_id, phrases_json")
      .gte("created_at", monday.toISOString());

    // Fetch previous cumulative stats (from latest weekly_analysis run)
    const { data: prevRun } = await db
      .from("geo_analysis_runs")
      .select("id")
      .eq("type", "weekly_analysis")
      .eq("status", "succeeded")
      .neq("id", run.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let priorStats: Map<string, PriorPhraseStat> = new Map();
    if (prevRun) {
      const { data: prevPhrases } = await db
        .from("phrase_statistics")
        .select("phrase, category, cumulative_frequency, cumulative_call_count, first_seen_at")
        .eq("run_id", prevRun.id);

      for (const p of prevPhrases ?? []) {
        const key = `${p.category}::${normalizePhraseKey(p.phrase)}`;
        priorStats.set(key, {
          cumulativeFrequency: p.cumulative_frequency,
          cumulativeCallCount: p.cumulative_call_count,
          firstSeenAt: p.first_seen_at,
        });
      }
    }

    // Aggregate this week's phrases
    const weekAgg = aggregatePhrases(extractions ?? []);

    // Merge with prior cumulative stats and persist
    const rows: PhraseStatRow[] = [];
    for (const [key, agg] of weekAgg.entries()) {
      const prior = priorStats.get(key);
      rows.push({
        run_id: run.id,
        phrase: agg.phrase,
        category: agg.category,
        frequency: agg.frequency,
        call_count: agg.callIds.size,
        cumulative_frequency: (prior?.cumulativeFrequency ?? 0) + agg.frequency,
        cumulative_call_count: (prior?.cumulativeCallCount ?? 0) + agg.callIds.size,
        example_contexts: agg.contexts.slice(0, 5),
        first_seen_at: prior?.firstSeenAt ?? new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });
    }

    // Batch insert
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await db.from("phrase_statistics").insert(batch);
      if (error) throw error;
    }

    await markGeoRunSucceeded(db, run.id, (extractions ?? []).length);
    return { runId: run.id, uniquePhrases: rows.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markGeoRunFailed(db, run.id, msg);
    throw err;
  }
}

// ── Aggregation helpers ─────────────────────────────────────────

interface PriorPhraseStat {
  cumulativeFrequency: number;
  cumulativeCallCount: number;
  firstSeenAt: string;
}

interface AggregatedPhrase {
  phrase: string;
  category: PhraseCategory;
  frequency: number;
  callIds: Set<string>;
  contexts: { quote: string; speaker: string; context: string }[];
}

interface PhraseStatRow {
  run_id: string;
  phrase: string;
  category: string;
  frequency: number;
  call_count: number;
  cumulative_frequency: number;
  cumulative_call_count: number;
  example_contexts: unknown;
  first_seen_at: string;
  last_seen_at: string;
}

function normalizePhraseKey(phrase: string): string {
  return phrase.toLowerCase().trim().replace(/\s+/g, " ");
}

function aggregatePhrases(
  extractions: { phrases_json: PhraseExtractionResult; call_id?: string }[]
): Map<string, AggregatedPhrase> {
  const agg = new Map<string, AggregatedPhrase>();

  for (const extraction of extractions) {
    const phrases = extraction.phrases_json;
    const callId = (extraction as { call_id?: string }).call_id ?? "unknown";

    for (const category of PHRASE_CATEGORIES) {
      const items: ExtractedPhrase[] = phrases[category] ?? [];
      for (const item of items) {
        const key = `${category}::${normalizePhraseKey(item.phrase)}`;

        if (!agg.has(key)) {
          agg.set(key, {
            phrase: item.phrase,
            category,
            frequency: 0,
            callIds: new Set(),
            contexts: [],
          });
        }

        const entry = agg.get(key)!;
        entry.frequency++;
        entry.callIds.add(callId);
        if (entry.contexts.length < 5) {
          entry.contexts.push({
            quote: item.verbatim_quote,
            speaker: item.speaker,
            context: item.context_summary,
          });
        }
      }
    }
  }

  return agg;
}
