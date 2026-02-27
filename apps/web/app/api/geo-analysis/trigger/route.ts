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
  const body = await req.json().catch(() => ({}));
  const pipelineId = (body.hubspot_pipeline_id as string) || process.env.HUBSPOT_PIPELINE_ID;
  const stageId = (body.hubspot_stage_id as string) || process.env.HUBSPOT_STAGE_ID;
  const backfill = body.backfill === true;

  if (!pipelineId || !stageId) {
    return NextResponse.json(
      { error: "Missing hubspot_pipeline_id / hubspot_stage_id (set in body or env)" },
      { status: 400 }
    );
  }

  try {
    const db = getServiceClient();

    const job = await enqueueJob(db, {
      type: "EXTRACT_GEO_PHRASES",
      payload: {
        hubspot_pipeline_id: pipelineId,
        hubspot_stage_id: stageId,
        backfill,
      },
    });

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      type: backfill ? "backfill" : "daily_extraction",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
