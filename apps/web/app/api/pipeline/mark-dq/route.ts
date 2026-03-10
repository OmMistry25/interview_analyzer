import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upsertWebhookEvent, enqueueJob } from "@transcript-evaluator/core/src/storage/repositories";
import { authenticatePipeline } from "../_auth";

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const authErr = authenticatePipeline(req);
  if (authErr) return authErr;

  const body = await req.json();
  const recordingId = body.recording_id;
  const meetingTitle: string = body.meeting_title ?? "";
  const reason: string = body.reason ?? "Not Stage 0";

  if (recordingId == null) {
    return NextResponse.json(
      { error: "Missing recording_id" },
      { status: 400 }
    );
  }

  try {
    const db = getServiceClient();
    const webhookId = `dq_${recordingId}`;

    await upsertWebhookEvent(db, {
      webhookId,
      verified: true,
      rawHeaders: { source: "pipeline_dq" },
      rawBody: { recording_id: recordingId, title: meetingTitle, reason },
    });

    await enqueueJob(db, {
      type: "MARK_DQ",
      payload: { recording_id: String(recordingId), title: meetingTitle, reason },
    });

    return NextResponse.json({ ok: true, status: "dq_queued", reason });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
