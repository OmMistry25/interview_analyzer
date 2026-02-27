import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const runId = searchParams.get("run_id");

  try {
    const db = getServiceClient();

    // If no run_id specified, find the latest weekly_analysis run
    let targetRunId = runId;
    if (!targetRunId) {
      const { data: latestRun } = await db
        .from("geo_analysis_runs")
        .select("id")
        .eq("type", "weekly_analysis")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestRun) {
        return NextResponse.json({ phrases: [], run_id: null, message: "No weekly analysis has been run yet" });
      }
      targetRunId = latestRun.id;
    }

    let query = db
      .from("phrase_statistics")
      .select("*")
      .eq("run_id", targetRunId)
      .order("cumulative_frequency", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq("category", category);
    }

    const { data: phrases, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      phrases: phrases ?? [],
      run_id: targetRunId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
