import { SupabaseClient } from "@supabase/supabase-js";
import { isFathomMeeting } from "@transcript-evaluator/core/src/ingestion/fathomPayload";
import { mapFathomToNormalized } from "@transcript-evaluator/core/src/ingestion/mapping";
import { extractSignals } from "@transcript-evaluator/core/src/extraction/extractor";
import { evaluateSignals } from "@transcript-evaluator/core/src/evaluation/evaluator";
import { crossCheckEvaluation } from "@transcript-evaluator/core/src/evaluation/rulesEngine";
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
      console.log("REPROCESS_CALL not yet implemented");
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
    rubricVersion: "s0_v1",
    extractorPromptVersion: "extract_v1",
    evaluatorPromptVersion: "eval_v1",
    modelExtractor: "gpt-4o",
    modelEvaluator: "gpt-4o",
    transcriptHash: hash,
  });
  console.log(`  Processing run: ${run.id}`);

  try {
    // Phase 7: Extract signals
    console.log("  Extracting signals...");
    const signals = await extractSignals(normalized.utterances);
    console.log("  Signals extracted.");

    await persistExtractedSignals(db, {
      processingRunId: run.id,
      callId: call.id,
      signalsJson: signals,
    });

    // Phase 8: Evaluate
    console.log("  Evaluating...");
    const evaluation = await evaluateSignals(signals);
    console.log(`  Evaluation: ${evaluation.overall_status} (score: ${evaluation.score})`);

    // Phase 9: Rules engine cross-check
    const crossCheck = crossCheckEvaluation(signals, evaluation);
    if (crossCheck.mismatch) {
      console.log(`  MISMATCH: ${crossCheck.mismatch}`);
      evaluation.overall_status = crossCheck.status;
    }

    await persistEvaluation(db, {
      processingRunId: run.id,
      callId: call.id,
      overallStatus: evaluation.overall_status,
      score: evaluation.score,
      evaluationJson: evaluation,
    });

    await markRunSucceeded(db, run.id);
    console.log(`  Run succeeded.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markRunFailed(db, run.id, msg);
    throw err;
  }
}
