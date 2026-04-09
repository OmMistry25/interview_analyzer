import { SupabaseClient } from "@supabase/supabase-js";
import { isFathomMeeting } from "@transcript-evaluator/core/src/ingestion/fathomPayload";
import { mapFathomToNormalized, buildMeetingContext, parseMeetingTitle, KNOWN_AES } from "@transcript-evaluator/core/src/ingestion/mapping";
import { extractProspectEmailDomainFromParticipants, resolveProspectDisplayName } from "@transcript-evaluator/core/src/ingestion/prospectIdentity";
import { extractSignals } from "@transcript-evaluator/core/src/extraction/extractor";
import { extractDealBrief } from "@transcript-evaluator/core/src/dealBrief/extractor";
import { evaluateSignals } from "@transcript-evaluator/core/src/evaluation/evaluator";
import { alignChaseS1OverallStatus, crossCheckEvaluation } from "@transcript-evaluator/core/src/evaluation/rulesEngine";
import { lookupCompanyEnrichment } from "@transcript-evaluator/core/src/enrichment/apollo";
import {
  formatGrowthTeamDigest,
  formatAESlackMessage,
  type SlackFormatOptions,
} from "@transcript-evaluator/core/src/formatting/slackPayload";
import { isNoShowCall } from "@transcript-evaluator/core/src/ingestion/noShow";
import { buildNoShowExtractedSignals, buildNoShowEvaluation } from "@transcript-evaluator/core/src/pipeline/noShowArtifacts";
import { runDailyExtraction, runBackfill, runWeeklyAnalysis } from "@transcript-evaluator/core/src/analysis/geoAnalysisPipeline";
import type { EvaluationResult } from "@transcript-evaluator/core/src/evaluation/schemas";
import type { ExtractedSignals } from "@transcript-evaluator/core/src/extraction/schemas";
import type { MeetingContext, NormalizedCall } from "@transcript-evaluator/core/src/types/normalized";
import type { DealBrief } from "@transcript-evaluator/core/src/dealBrief/schemas";
import { isDealBriefPipelineEnabled } from "@transcript-evaluator/core/src/config/featureFlags";
import {
  getWebhookEvent,
  upsertCall,
  persistParticipants,
  persistUtterances,
  computeTranscriptHash,
  createProcessingRun,
  markRunSucceeded,
  markRunFailed,
  persistExtractedSignals,
  persistEvaluation,
} from "@transcript-evaluator/core/src/storage/repositories";

/** Prefer LLM-extracted company (same source as dashboard); fall back to title parsing. */
function resolveCallbackAccountName(
  signals: ExtractedSignals,
  prospectFromTitle: string | null
): string | null {
  const v = signals.account.company_name.value;
  let candidate: string | null = null;
  if (typeof v === "string") {
    candidate = v.trim() || null;
  } else if (typeof v === "number" && Number.isFinite(v)) {
    candidate = String(v);
  } else if (Array.isArray(v) && v.length > 0) {
    candidate = v.map(String).join(", ").trim() || null;
  }
  if (candidate && candidate.toLowerCase() !== "unknown") {
    return candidate;
  }
  return prospectFromTitle;
}

async function extractEvaluateAndTune(
  normalized: NormalizedCall,
  meetingCtx: MeetingContext
): Promise<{
  signals: ExtractedSignals;
  evaluation: EvaluationResult;
  dealBrief: DealBrief | null;
  noShow: boolean;
}> {
  if (isNoShowCall(normalized)) {
    console.log("  No-show transcript — skipping LLM extract, deal brief, and evaluate.");
    const signals = buildNoShowExtractedSignals(normalized, meetingCtx);
    const evaluation = buildNoShowEvaluation();
    return { signals, evaluation, dealBrief: null, noShow: true };
  }

  console.log(`  Extracting signals... (prospect: ${meetingCtx.prospectCompany ?? "unknown"})`);
  const signals = await extractSignals(normalized.utterances, meetingCtx);
  console.log("  Signals extracted.");

  const briefEnabled = isDealBriefPipelineEnabled();
  let dealBrief: DealBrief | null = null;
  if (briefEnabled) {
    try {
      console.log("  Building AE deal brief...");
      dealBrief = await extractDealBrief(normalized.utterances, meetingCtx, signals);
      console.log("  Deal brief done.");
    } catch (briefErr) {
      const msg = briefErr instanceof Error ? briefErr.message : String(briefErr);
      console.warn(`  Deal brief failed: ${msg.slice(0, 200)}`);
    }
  } else {
    console.log("  Deal brief pipeline off (DEAL_BRIEF_ENABLED=false).");
  }

  console.log("  Evaluating (BANT)...");
  const evaluation = await evaluateSignals(signals, meetingCtx, "gpt-4o", dealBrief);
  console.log(`  Evaluation: ${evaluation.overall_status} (score: ${evaluation.score}, stage1: ${evaluation.stage_1_probability}%)`);

  const crossCheck = crossCheckEvaluation(signals, evaluation, meetingCtx.dealSegment);
  if (crossCheck.mismatch) {
    console.log(`  MISMATCH: ${crossCheck.mismatch}`);
    evaluation.overall_status = crossCheck.status;
  }
  alignChaseS1OverallStatus(evaluation);

  return { signals, evaluation, dealBrief, noShow: false };
}

export async function processJob(
  db: SupabaseClient,
  job: { id: string; type: string; payload: Record<string, unknown> }
): Promise<void> {
  switch (job.type) {
    case "PROCESS_FATHOM_MEETING":
      await processFathomMeeting(db, job.payload);
      break;

    case "REPROCESS_CALL":
      await reprocessCall(db, job.payload);
      break;

    case "MARK_DQ":
      await markCallDQ(db, job.payload);
      break;

    case "EXTRACT_GEO_PHRASES":
      await processGeoExtraction(db, job.payload);
      break;

    case "RUN_GEO_WEEKLY_ANALYSIS":
      await processGeoWeeklyAnalysis(db);
      break;

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

async function processFathomMeeting(
  db: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const eventId = payload.webhook_event_id as string;
  if (!eventId) throw new Error("Missing webhook_event_id in job payload");

  const event = await getWebhookEvent(db, eventId);
  if (!event) throw new Error(`Webhook event ${eventId} not found`);

  if (!isFathomMeeting(event.raw_body)) {
    throw new Error("Webhook body is not a valid Fathom meeting payload");
  }

  const normalized = mapFathomToNormalized(event.raw_body);
  console.log(`  Mapped call: "${normalized.title}" with ${normalized.utterances.length} utterances`);

  const call = await upsertCall(db, normalized);
  console.log(`  Call ID: ${call.id}`);

  const participants = await persistParticipants(db, call.id, normalized.participants);
  const participantMap = new Map<string, string>();
  for (const p of participants) {
    participantMap.set(p.name, p.id);
  }

  await persistUtterances(db, call.id, normalized.utterances, participantMap);

  const hash = computeTranscriptHash(normalized.utterances);
  console.log(`  Transcript hash: ${hash}`);

  const run = await createProcessingRun(db, {
    callId: call.id,
    rubricVersion: "bant_v1",
    extractorPromptVersion: "extract_v4",
    evaluatorPromptVersion: "eval_v3",
    modelExtractor: "gpt-4o",
    modelEvaluator: "gpt-4o",
    transcriptHash: hash,
  });
  console.log(`  Processing run: ${run.id}`);

  try {
    const meetingCtx = buildMeetingContext(normalized);
    const titleParsed = meetingCtx.prospectCompany;

    const enrichment = await lookupCompanyEnrichment({
      prospectEmailDomain: meetingCtx.prospectEmailDomain,
      titleParsedCompanyName: titleParsed,
    });
    meetingCtx.dealSegment = enrichment.segment;
    meetingCtx.prospectCompany = resolveProspectDisplayName({
      titleParsedName: titleParsed,
      emailDomain: meetingCtx.prospectEmailDomain,
    });
    console.log(
      `  Deal segment: ${enrichment.segment} (employees: ${enrichment.employeeCount ?? "unknown"})` +
        (meetingCtx.prospectEmailDomain ? ` · domain: ${meetingCtx.prospectEmailDomain}` : "")
    );

    const { signals, evaluation, dealBrief, noShow } = await extractEvaluateAndTune(normalized, meetingCtx);

    const briefEnabled = isDealBriefPipelineEnabled();
    await persistExtractedSignals(db, {
      processingRunId: run.id,
      callId: call.id,
      signalsJson: signals,
      dealBriefJson: briefEnabled ? dealBrief : undefined,
    });

    await persistEvaluation(db, {
      processingRunId: run.id,
      callId: call.id,
      overallStatus: evaluation.overall_status,
      score: evaluation.score,
      stage1Probability: evaluation.stage_1_probability,
      evaluationJson: evaluation,
    });

    await markRunSucceeded(db, run.id);
    console.log(`  Run succeeded.`);

    const callbackUrl = payload.callback_url as string | undefined;
    if (callbackUrl) {
      await fireCallback(callbackUrl, evaluation, signals, meetingCtx, dealBrief, { noShow });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markRunFailed(db, run.id, msg);
    throw err;
  }
}

async function fireCallback(
  url: string,
  evaluation: EvaluationResult,
  signals: ExtractedSignals,
  meetingCtx: MeetingContext,
  dealBrief: DealBrief | null,
  slackOptions?: SlackFormatOptions
): Promise<void> {
  const ctx = {
    aeName: meetingCtx.aeName,
    accountName: resolveCallbackAccountName(signals, meetingCtx.prospectCompany),
    meetingTitle: meetingCtx.meetingTitle,
  };

  const growthDigest = formatGrowthTeamDigest(evaluation, signals, ctx, slackOptions);
  const aeMessage = formatAESlackMessage(evaluation, signals, ctx, slackOptions);

  const body = {
    growth_team: growthDigest,
    ae: aeMessage,
    raw: {
      evaluation,
      signals_summary: signals.call_summary,
      participant_titles: signals.participant_titles,
      deal_brief: dealBrief,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(`  Callback POST to ${url} → ${res.status}`);
  } catch (err) {
    console.error(`  Callback POST failed:`, err);
  }
}

async function processGeoExtraction(
  db: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const pipelineId = payload.hubspot_pipeline_id as string;
  const stageId = payload.hubspot_stage_id as string;
  const isBackfill = payload.backfill === true;

  if (!pipelineId || !stageId) {
    throw new Error("Missing hubspot_pipeline_id or hubspot_stage_id in job payload");
  }

  const config = { hubspotPipelineId: pipelineId, hubspotStageId: stageId };

  if (isBackfill) {
    const result = await runBackfill(db, config);
    console.log(`  GEO backfill complete: ${result.callsProcessed} calls processed (run: ${result.runId})`);
  } else {
    const result = await runDailyExtraction(db, config);
    console.log(`  GEO daily extraction complete: ${result.callsProcessed} calls processed (run: ${result.runId})`);
  }
}

async function processGeoWeeklyAnalysis(db: SupabaseClient): Promise<void> {
  const result = await runWeeklyAnalysis(db);
  console.log(`  GEO weekly analysis complete: ${result.uniquePhrases} unique phrases (run: ${result.runId})`);
}

async function markCallDQ(
  db: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const recordingId = payload.recording_id as string;
  const title = (payload.title as string) || "Unknown";
  const reason = (payload.reason as string) || "Not Stage 0";

  if (!recordingId) throw new Error("Missing recording_id in MARK_DQ payload");

  const { data: existing } = await db
    .from("calls")
    .select("id")
    .eq("source_recording_id", recordingId)
    .maybeSingle();

  let callId: string;
  if (existing) {
    callId = existing.id;
  } else {
    const { data: inserted, error } = await db
      .from("calls")
      .insert({
        source: "fathom",
        source_recording_id: recordingId,
        title,
        start_time: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    callId = inserted.id;
  }

  const { error } = await db
    .from("calls")
    .update({ dq_reason: reason })
    .eq("id", callId);
  if (error) throw error;

  console.log(`  Marked call ${callId} ("${title}") as DQ: ${reason}`);
}

async function reprocessCall(
  db: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const callId = payload.call_id as string;
  if (!callId) throw new Error("Missing call_id in job payload");

  const { data: call, error: callErr } = await db
    .from("calls")
    .select("id, title")
    .eq("id", callId)
    .single();
  if (callErr || !call) throw new Error(`Call ${callId} not found`);

  const { data: participants } = await db
    .from("participants")
    .select("name, email, role")
    .eq("call_id", callId);

  const { data: utteranceRows } = await db
    .from("utterances")
    .select("idx, speaker_label_raw, timestamp_start_sec, timestamp_end_sec, text_raw, text_normalized")
    .eq("call_id", callId)
    .order("idx", { ascending: true });

  const utterances = (utteranceRows ?? []).map((u) => ({
    idx: u.idx as number,
    speakerLabelRaw: u.speaker_label_raw as string,
    timestampStartSec: u.timestamp_start_sec as number | null,
    timestampEndSec: u.timestamp_end_sec as number | null,
    textRaw: u.text_raw as string,
    textNormalized: u.text_normalized as string,
  }));

  console.log(`  Reprocessing "${call.title}" with ${utterances.length} utterances`);

  const hash = computeTranscriptHash(utterances);

  const internalAttendees = (participants ?? [])
    .filter((p) => p.role === "ae")
    .map((p) => ({ name: p.name as string, email: (p.email as string) ?? null }));

  const knownAE = internalAttendees.find((a) =>
    KNOWN_AES.some((ae: string) => a.name.toLowerCase().includes(ae.toLowerCase()))
  );

  const participantRows = (participants ?? []).map((p) => ({
    email: (p.email as string) ?? null,
    role: p.role as "ae" | "prospect" | "unknown",
  }));
  const prospectEmailDomain = extractProspectEmailDomainFromParticipants(participantRows);
  const titleParsed = parseMeetingTitle(call.title as string);
  const enrichment = await lookupCompanyEnrichment({
    prospectEmailDomain,
    titleParsedCompanyName: titleParsed,
  });
  const prospectCompany = resolveProspectDisplayName({
    titleParsedName: titleParsed,
    emailDomain: prospectEmailDomain,
  });

  const meetingCtx = {
    meetingTitle: call.title as string,
    ourCompany: "Console",
    prospectCompany,
    prospectEmailDomain,
    aeName: knownAE?.name ?? internalAttendees[0]?.name ?? null,
    dealSegment: enrichment.segment,
    internalAttendees,
    externalAttendees: (participants ?? [])
      .filter((p) => p.role === "prospect")
      .map((p) => ({ name: p.name as string, email: (p.email as string) ?? null })),
  };
  console.log(
    `  Deal segment: ${enrichment.segment} (employees: ${enrichment.employeeCount ?? "unknown"})` +
      (prospectEmailDomain ? ` · domain: ${prospectEmailDomain}` : "")
  );

  const normalized: NormalizedCall = {
    sourceMeetingId: null,
    sourceRecordingId: null,
    title: call.title as string,
    startTime: null,
    endTime: null,
    shareUrl: null,
    fathomUrl: null,
    participants: (participants ?? []).map((p) => ({
      name: p.name as string,
      email: (p.email as string) ?? null,
      role: p.role as "ae" | "prospect" | "unknown",
      sourceLabel: null,
    })),
    utterances,
  };

  const run = await createProcessingRun(db, {
    callId,
    rubricVersion: "bant_v1",
    extractorPromptVersion: "extract_v4",
    evaluatorPromptVersion: "eval_v3",
    modelExtractor: "gpt-4o",
    modelEvaluator: "gpt-4o",
    transcriptHash: hash,
  });
  console.log(`  Processing run: ${run.id}`);

  try {
    const { signals, evaluation, dealBrief, noShow } = await extractEvaluateAndTune(normalized, meetingCtx);

    const briefEnabled = isDealBriefPipelineEnabled();
    await persistExtractedSignals(db, {
      processingRunId: run.id,
      callId,
      signalsJson: signals,
      dealBriefJson: briefEnabled ? dealBrief : undefined,
    });

    await persistEvaluation(db, {
      processingRunId: run.id,
      callId,
      overallStatus: evaluation.overall_status,
      score: evaluation.score,
      stage1Probability: evaluation.stage_1_probability,
      evaluationJson: evaluation,
    });

    await markRunSucceeded(db, run.id);
    console.log(`  Reprocess succeeded.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markRunFailed(db, run.id, msg);
    throw err;
  }
}
