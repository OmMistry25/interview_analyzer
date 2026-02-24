import { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { NormalizedCall } from "../types/normalized";

export async function upsertWebhookEvent(
  db: SupabaseClient,
  params: {
    webhookId: string;
    verified: boolean;
    rawHeaders: Record<string, string>;
    rawBody: unknown;
  }
) {
  const { data, error } = await db
    .from("fathom_webhook_events")
    .upsert(
      {
        webhook_id: params.webhookId,
        verified: params.verified,
        raw_headers: params.rawHeaders,
        raw_body: params.rawBody,
        processing_status: "queued",
      },
      { onConflict: "webhook_id" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function enqueueJob(
  db: SupabaseClient,
  params: {
    type: string;
    payload: Record<string, unknown>;
  }
) {
  const { data, error } = await db
    .from("jobs")
    .insert({
      type: params.type,
      status: "queued",
      payload: params.payload,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function getWebhookEvent(
  db: SupabaseClient,
  eventId: string
): Promise<{ id: string; raw_body: unknown } | null> {
  const { data, error } = await db
    .from("fathom_webhook_events")
    .select("id, raw_body")
    .eq("id", eventId)
    .single();

  if (error) return null;
  return data;
}

export async function upsertCall(
  db: SupabaseClient,
  call: NormalizedCall
): Promise<{ id: string }> {
  const filters = [
    call.sourceRecordingId ? `source_recording_id.eq.${call.sourceRecordingId}` : null,
    call.shareUrl ? `share_url.eq.${call.shareUrl}` : null,
  ].filter(Boolean);

  if (filters.length > 0) {
    const { data: existing } = await db
      .from("calls")
      .select("id")
      .or(filters.join(","))
      .limit(1)
      .maybeSingle();

    if (existing) return existing;
  }

  const { data, error } = await db
    .from("calls")
    .insert({
      source: "fathom",
      source_meeting_id: call.sourceMeetingId,
      source_recording_id: call.sourceRecordingId,
      title: call.title,
      start_time: call.startTime,
      end_time: call.endTime,
      share_url: call.shareUrl,
      fathom_url: call.fathomUrl,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function persistParticipants(
  db: SupabaseClient,
  callId: string,
  participants: NormalizedCall["participants"]
): Promise<{ id: string; name: string }[]> {
  if (participants.length === 0) return [];

  await db.from("participants").delete().eq("call_id", callId);

  const rows = participants.map((p) => ({
    call_id: callId,
    name: p.name,
    email: p.email,
    role: p.role,
    source_label: p.sourceLabel,
  }));

  const { data, error } = await db
    .from("participants")
    .insert(rows)
    .select("id, name");

  if (error) throw error;
  return data;
}

export async function persistUtterances(
  db: SupabaseClient,
  callId: string,
  utterances: NormalizedCall["utterances"],
  participantMap: Map<string, string>
): Promise<void> {
  await db.from("utterances").delete().eq("call_id", callId);

  const rows = utterances.map((u) => ({
    call_id: callId,
    idx: u.idx,
    speaker_participant_id: participantMap.get(u.speakerLabelRaw) ?? null,
    speaker_label_raw: u.speakerLabelRaw,
    timestamp_start_sec: u.timestampStartSec,
    timestamp_end_sec: u.timestampEndSec,
    text_raw: u.textRaw,
    text_normalized: u.textNormalized,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await db.from("utterances").insert(batch);
    if (error) throw error;
  }
}

export function computeTranscriptHash(
  utterances: NormalizedCall["utterances"]
): string {
  const content = utterances
    .map((u) => `${u.speakerLabelRaw}|${u.timestampStartSec ?? ""}|${u.textRaw}`)
    .join("\n");

  return crypto.createHash("sha256").update(content).digest("hex");
}

// --- Processing runs ---

export interface ProcessingRunParams {
  callId: string;
  rubricVersion: string;
  extractorPromptVersion: string;
  evaluatorPromptVersion: string;
  modelExtractor: string;
  modelEvaluator: string;
  transcriptHash: string;
}

export async function createProcessingRun(
  db: SupabaseClient,
  params: ProcessingRunParams
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("processing_runs")
    .insert({
      call_id: params.callId,
      status: "running",
      rubric_version: params.rubricVersion,
      extractor_prompt_version: params.extractorPromptVersion,
      evaluator_prompt_version: params.evaluatorPromptVersion,
      model_extractor: params.modelExtractor,
      model_evaluator: params.modelEvaluator,
      transcript_hash: params.transcriptHash,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function markRunSucceeded(
  db: SupabaseClient,
  runId: string
): Promise<void> {
  const { error } = await db
    .from("processing_runs")
    .update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) throw error;
}

export async function markRunFailed(
  db: SupabaseClient,
  runId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await db
    .from("processing_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq("id", runId);

  if (error) throw error;
}
