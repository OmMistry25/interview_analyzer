import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enqueueJob } from "@transcript-evaluator/core/src/storage/repositories";

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const callId = body.call_id;

  if (!callId || typeof callId !== "string") {
    return NextResponse.json({ error: "Missing call_id" }, { status: 400 });
  }

  const db = getServiceClient();

  const { data: call } = await db.from("calls").select("id").eq("id", callId).single();
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const job = await enqueueJob(db, {
    type: "REPROCESS_CALL",
    payload: { call_id: callId },
  });

  return NextResponse.json({ ok: true, job_id: job.id });
}
