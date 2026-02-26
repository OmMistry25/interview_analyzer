import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upsertWebhookEvent, enqueueJob } from "@transcript-evaluator/core/src/storage/repositories";
import { authenticatePipeline } from "../_auth";

const FATHOM_API_URL = "https://api.fathom.ai/external/v1";

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function fetchMeetingByRecordingId(
  apiKey: string,
  recordingId: string | number
): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `${FATHOM_API_URL}/meetings?include_transcript=true`,
    { headers: { "X-Api-Key": apiKey } }
  );
  if (!res.ok) throw new Error(`Fathom API error: ${res.status}`);
  const data = await res.json();

  let cursor: string | null = data.next_cursor;
  const target = String(recordingId);

  const check = (items: Record<string, unknown>[]) =>
    items.find((m) => String(m.recording_id) === target);

  let match = check(data.items ?? []);
  if (match) return match;

  while (cursor) {
    const params = new URLSearchParams({ include_transcript: "true", cursor });
    const page = await fetch(`${FATHOM_API_URL}/meetings?${params}`, {
      headers: { "X-Api-Key": apiKey },
    });
    if (!page.ok) throw new Error(`Fathom API error: ${page.status}`);
    const pageData = await page.json();
    match = check(pageData.items ?? []);
    if (match) return match;
    cursor = pageData.next_cursor;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const authErr = authenticatePipeline(req);
  if (authErr) return authErr;

  const body = await req.json();
  const recordingId = body.recording_id;
  const callbackUrl: string | undefined = body.callback_url;

  if (recordingId == null) {
    return NextResponse.json(
      { error: "Missing recording_id" },
      { status: 400 }
    );
  }

  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FATHOM_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const meeting = await fetchMeetingByRecordingId(apiKey, recordingId);
    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found for the given recording_id" },
        { status: 404 }
      );
    }

    const webhookId = `pipeline_${recordingId}`;
    const db = getServiceClient();

    const event = await upsertWebhookEvent(db, {
      webhookId,
      verified: true,
      rawHeaders: { source: "pipeline" },
      rawBody: meeting,
    });

    const jobPayload: Record<string, unknown> = {
      webhook_event_id: event.id,
    };
    if (callbackUrl) {
      jobPayload.callback_url = callbackUrl;
    }

    await enqueueJob(db, {
      type: "PROCESS_FATHOM_MEETING",
      payload: jobPayload,
    });

    return NextResponse.json({
      ok: true,
      event_id: event.id,
      title: meeting.title,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
