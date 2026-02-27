import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enqueueJob } from "@transcript-evaluator/core/src/storage/repositories";

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST() {
  try {
    const db = getServiceClient();

    const job = await enqueueJob(db, {
      type: "RUN_GEO_WEEKLY_ANALYSIS",
      payload: {},
    });

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      type: "weekly_analysis",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
