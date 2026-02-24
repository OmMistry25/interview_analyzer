import { SupabaseClient } from "@supabase/supabase-js";
import { isFathomPayload } from "@transcript-evaluator/core/src/ingestion/fathomPayload";
import { mapFathomToNormalized } from "@transcript-evaluator/core/src/ingestion/mapping";
import {
  getWebhookEvent,
  upsertCall,
  persistParticipants,
  persistUtterances,
  computeTranscriptHash,
  createProcessingRun,
  markRunSucceeded,
  markRunFailed,
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

  if (!isFathomPayload(event.raw_body)) {
    throw new Error("Webhook body is not a valid Fathom payload");
  }

  const normalized = mapFathomToNormalized(event.raw_body.data);
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
    // LLM extraction + evaluation will be added in Phases 7-8
    await markRunSucceeded(db, run.id);
    console.log(`  Run succeeded.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markRunFailed(db, run.id, msg);
    throw err;
  }
}
