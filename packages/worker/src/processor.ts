import { SupabaseClient } from "@supabase/supabase-js";
import { isFathomMeeting } from "@transcript-evaluator/core/src/ingestion/fathomPayload";
import { mapFathomToNormalized, buildMeetingContext, parseMeetingTitle, KNOWN_AES } from "@transcript-evaluator/core/src/ingestion/mapping";
import { extractSignals } from "@transcript-evaluator/core/src/extraction/extractor";
import { evaluateSignals } from "@transcript-evaluator/core/src/evaluation/evaluator";
import { crossCheckEvaluation } from "@transcript-evaluator/core/src/evaluation/rulesEngine";
import { lookupCompanySize } from "@transcript-evaluator/core/src/enrichment/apollo";
import { formatGrowthTeamDigest, formatAESlackMessage } from "@transcript-evaluator/core/src/formatting/slackPayload";
import type { EvaluationResult } from "@transcript-evaluator/core/src/evaluation/schemas";
import type { ExtractedSignals } from "@transcript-evaluator/core/src/extraction/schemas";
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
    extractorPromptVersion: "extract_v3",
    evaluatorPromptVersion: "eval_v2",
    modelExtractor: "gpt-4o",
    modelEvaluator: "gpt-4o",
    transcriptHash: hash,
  });
  console.log(`  Processing run: ${run.id}`);

  try {
    const meetingCtx = buildMeetingContext(normalized);

    const enrichment = await lookupCompanySize(meetingCtx.prospectCompany);
    meetingCtx.dealSegment = enrichment.segment;
    console.log(`  Deal segment: ${enrichment.segment} (employees: ${enrichment.employeeCount ?? "unknown"})`);

    console.log(`  Extracting signals... (prospect: ${meetingCtx.prospectCompany ?? "unknown"})`);
    const signals = await extractSignals(normalized.utterances, meetingCtx);
    console.log("  Signals extracted.");

    await persistExtractedSignals(db, {
      processingRunId: run.id,
      callId: call.id,
      signalsJson: signals,
    });

    console.log("  Evaluating (BANT)...");
    const evaluation = await evaluateSignals(signals, meetingCtx);
    console.log(`  Evaluation: ${evaluation.overall_status} (score: ${evaluation.score}, stage1: ${evaluation.stage_1_probability}%)`);

    const crossCheck = crossCheckEvaluation(signals, evaluation, meetingCtx.dealSegment);
    if (crossCheck.mismatch) {
      console.log(`  MISMATCH: ${crossCheck.mismatch}`);
      evaluation.overall_status = crossCheck.status;
    }

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
      await fireCallback(callbackUrl, evaluation, signals, meetingCtx);
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
  meetingCtx: { meetingTitle: string; prospectCompany: string | null; aeName: string | null }
): Promise<void> {
  const ctx = {
    aeName: meetingCtx.aeName,
    accountName: meetingCtx.prospectCompany,
    meetingTitle: meetingCtx.meetingTitle,
  };

  const growthDigest = formatGrowthTeamDigest(evaluation, signals, ctx);
  const aeMessage = formatAESlackMessage(evaluation, signals, ctx);

  const body = {
    growth_team: growthDigest,
    ae: aeMessage,
    raw: {
      evaluation,
      signals_summary: signals.call_summary,
      participant_titles: signals.participant_titles,
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

  if (utterances.length === 0) throw new Error(`No utterances found for call ${callId}`);

  console.log(`  Reprocessing "${call.title}" with ${utterances.length} utterances`);

  const hash = computeTranscriptHash(utterances);

  const internalAttendees = (participants ?? [])
    .filter((p) => p.role === "ae")
    .map((p) => ({ name: p.name as string, email: (p.email as string) ?? null }));

  const knownAE = internalAttendees.find((a) =>
    KNOWN_AES.some((ae: string) => a.name.toLowerCase().includes(ae.toLowerCase()))
  );

  const prospectCompany = parseMeetingTitle(call.title as string);
  const enrichment = await lookupCompanySize(prospectCompany);

  const meetingCtx = {
    meetingTitle: call.title as string,
    ourCompany: "Console",
    prospectCompany,
    aeName: knownAE?.name ?? internalAttendees[0]?.name ?? null,
    dealSegment: enrichment.segment,
    internalAttendees,
    externalAttendees: (participants ?? [])
      .filter((p) => p.role === "prospect")
      .map((p) => ({ name: p.name as string, email: (p.email as string) ?? null })),
  };
  console.log(`  Deal segment: ${enrichment.segment} (employees: ${enrichment.employeeCount ?? "unknown"})`);

  const run = await createProcessingRun(db, {
    callId,
    rubricVersion: "bant_v1",
    extractorPromptVersion: "extract_v3",
    evaluatorPromptVersion: "eval_v2",
    modelExtractor: "gpt-4o",
    modelEvaluator: "gpt-4o",
    transcriptHash: hash,
  });
  console.log(`  Processing run: ${run.id}`);

  try {
    console.log(`  Extracting signals... (prospect: ${meetingCtx.prospectCompany ?? "unknown"})`);
    const signals = await extractSignals(utterances, meetingCtx);
    console.log("  Signals extracted.");

    await persistExtractedSignals(db, {
      processingRunId: run.id,
      callId,
      signalsJson: signals,
    });

    console.log("  Evaluating (BANT)...");
    const evaluation = await evaluateSignals(signals, meetingCtx);
    console.log(`  Evaluation: ${evaluation.overall_status} (score: ${evaluation.score}, stage1: ${evaluation.stage_1_probability}%)`);

    const crossCheck = crossCheckEvaluation(signals, evaluation, meetingCtx.dealSegment);
    if (crossCheck.mismatch) {
      console.log(`  MISMATCH: ${crossCheck.mismatch}`);
      evaluation.overall_status = crossCheck.status;
    }

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
