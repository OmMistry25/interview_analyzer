import { createSupabaseServerClient } from "@/lib/supabase/server";
import GeoAnalysisDashboard from "./GeoAnalysisDashboard";

export const dynamic = "force-dynamic";

interface PhraseRow {
  id: string;
  phrase: string;
  category: string;
  frequency: number;
  call_count: number;
  cumulative_frequency: number;
  cumulative_call_count: number;
  example_contexts: { quote: string; speaker: string; context: string }[];
  first_seen_at: string;
  last_seen_at: string;
}

interface RunRow {
  id: string;
  type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  calls_processed: number;
  error: string | null;
  created_at: string;
}

export default async function GeoAnalysisPage() {
  const supabase = await createSupabaseServerClient();

  // Fetch latest weekly analysis run
  const { data: latestRun } = await supabase
    .from("geo_analysis_runs")
    .select("id")
    .eq("type", "weekly_analysis")
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch phrase statistics if a run exists
  let phrases: PhraseRow[] = [];
  let totalUniquePhrases = 0;
  if (latestRun) {
    const { data } = await supabase
      .from("phrase_statistics")
      .select("*")
      .eq("run_id", latestRun.id)
      .order("cumulative_frequency", { ascending: false })
      .limit(500);
    phrases = (data ?? []) as PhraseRow[];

    const { count } = await supabase
      .from("phrase_statistics")
      .select("id", { count: "exact", head: true })
      .eq("run_id", latestRun.id);
    totalUniquePhrases = count ?? phrases.length;
  }

  // Fetch recent runs
  const { data: runsData } = await supabase
    .from("geo_analysis_runs")
    .select("id, type, status, started_at, finished_at, calls_processed, error, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const runs = (runsData ?? []) as RunRow[];

  // Summary stats
  const { count: totalExtractions } = await supabase
    .from("call_phrase_extractions")
    .select("id", { count: "exact", head: true });

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>GEO Phrase Analysis</h1>
        <p className="page-meta">
          Extract and rank the language your prospects use — for GEO and SEO testing.
        </p>
      </div>

      <GeoAnalysisDashboard
        initialPhrases={phrases}
        initialRuns={runs}
        totalCallsAnalyzed={totalExtractions ?? 0}
        totalUniquePhrases={totalUniquePhrases}
        latestRunId={latestRun?.id ?? null}
      />
    </div>
  );
}
