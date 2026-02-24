import { SupabaseClient } from "@supabase/supabase-js";

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
