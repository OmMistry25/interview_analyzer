import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  population: string;
  input_call_count: number;
  scanned_count: number;
  hit_count: number;
  scanner_version: string;
}

type CallEmbed = { id: string; title: string; start_time: string | null };

interface HitRow {
  call_id: string;
  snippets: string[];
  mention_count?: number | null;
  match_breakdown: Record<string, unknown> | null;
  calls: CallEmbed | CallEmbed[] | null;
}

function callFromHit(hit: HitRow): CallEmbed | null {
  const c = hit.calls;
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

function formatBreakdown(b: Record<string, unknown> | null): string {
  if (!b || typeof b !== "object") return "—";
  const phrase = typeof b.phrase === "number" ? b.phrase : 0;
  const ctx = typeof b.context_window === "number" ? b.context_window : 0;
  return `phrase: ${phrase}, context: ${ctx}`;
}

export default async function TeamsScanPage() {
  const supabase = await createSupabaseServerClient();

  const { data: latestRun, error: runError } = await supabase
    .from("teams_mention_scan_runs")
    .select(
      "id, started_at, finished_at, population, input_call_count, scanned_count, hit_count, scanner_version"
    )
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    return (
      <div className="page-container">
        <p className="feedback-error">Error loading scan runs: {runError.message}</p>
      </div>
    );
  }

  const run = latestRun as RunRow | null;
  let hits: HitRow[] = [];

  if (run?.id) {
    const { data: hitsData, error: hitsError } = await supabase
      .from("teams_mention_scan_hits")
      .select("call_id, snippets, mention_count, match_breakdown, calls ( id, title, start_time )")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true });

    if (hitsError) {
      return (
        <div className="page-container">
          <p className="feedback-error">Error loading hits: {hitsError.message}</p>
        </div>
      );
    }
    hits = (hitsData ?? []) as unknown as HitRow[];
  }

  const scanned = run?.scanned_count ?? 0;
  const hitCount = run?.hit_count ?? 0;
  const rate = scanned > 0 ? ((hitCount / scanned) * 100).toFixed(1) : "—";
  const totalMentions = hits.reduce(
    (sum, h) => sum + (typeof h.mention_count === "number" ? h.mention_count : 0),
    0
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Teams mention scan</h1>
        <p className="page-meta">
          Prospect (attendee) speech only. Strong phrases (e.g. Microsoft Teams, MS Teams, in Teams) or
          standalone <code>teams</code> near stack/needs anchors. Experimental lexical scan — tune in
          core and re-run.
        </p>
      </div>

      {!run ? (
        <section className="card">
          <p className="page-meta" style={{ marginBottom: 0 }}>
            No completed scan yet. From <code>packages/core</code>:{" "}
            <code>npm run scan:teams-mentions</code> (all Fathom calls) or{" "}
            <code>npm run scan:teams-mentions -- --qualified-only</code>. HubSpot: omit{" "}
            <code>--apply</code> for dry-run; set <code>HUBSPOT_COMPANY_TEAMS_TAG_PROPERTY</code> when
            applying. Requires root <code>.env</code> with Supabase service keys (and{" "}
            <code>HUBSPOT_API_KEY</code> for company resolution).
          </p>
        </section>
      ) : (
        <>
          <section className="card" style={{ marginBottom: 24 }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Latest run
            </h2>
            <ul className="list-clean" style={{ lineHeight: 1.8 }}>
              <li>
                <strong>Population:</strong> {run.population}
              </li>
              <li>
                <strong>Input calls:</strong> {run.input_call_count}
              </li>
              <li>
                <strong>Scanned:</strong> {run.scanned_count}
              </li>
              <li>
                <strong>Hit calls:</strong> {run.hit_count}{" "}
                {scanned > 0 ? <span className="page-meta">({rate}% of scanned)</span> : null}
              </li>
              <li>
                <strong>Total mentions (hits):</strong> {totalMentions}
              </li>
              <li>
                <strong>Scanner version:</strong>{" "}
                <code style={{ fontSize: "0.9em" }}>{run.scanner_version}</code>
              </li>
              <li>
                <strong>Run time:</strong>{" "}
                {run.finished_at
                  ? `${new Date(run.started_at).toLocaleString()} → ${new Date(run.finished_at).toLocaleString()}`
                  : new Date(run.started_at).toLocaleString()}
              </li>
            </ul>
            <p className="page-meta" style={{ marginBottom: 0, marginTop: 16 }}>
              Re-run: <code>npm run scan:teams-mentions</code> in <code>packages/core</code>. Fathom
              backfill (oldest → newest): use{" "}
              <code>npx tsx src/scripts/bulkImportFathom.ts --through-nov-2025</code> for everything
              through end of November 2025, or <code>--after=</code> / <code>--before=</code> for a
              custom window.
            </p>
          </section>

          <section className="card">
            <h2 className="section-title" style={{ marginTop: 0 }}>
              Hits ({hits.length})
            </h2>
            {hits.length === 0 ? (
              <p className="page-meta">No prospect-side matches in this run.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Call</th>
                      <th>Mentions</th>
                      <th>Breakdown</th>
                      <th>Snippets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((h) => {
                      const call = callFromHit(h);
                      const title = call?.title ?? "Untitled";
                      const callHref = `/dashboard/calls/${h.call_id}`;
                      const snippets = Array.isArray(h.snippets) ? h.snippets : [];
                      const mc = typeof h.mention_count === "number" ? h.mention_count : 0;
                      const bd =
                        h.match_breakdown && typeof h.match_breakdown === "object"
                          ? (h.match_breakdown as Record<string, unknown>)
                          : null;
                      return (
                        <tr key={h.call_id}>
                          <td>
                            <Link href={callHref}>{title}</Link>
                            {call?.start_time ? (
                              <div className="page-meta" style={{ marginTop: 4 }}>
                                {new Date(call.start_time).toLocaleString()}
                              </div>
                            ) : null}
                          </td>
                          <td>{mc}</td>
                          <td className="page-meta" style={{ fontSize: "0.9em" }}>
                            {formatBreakdown(bd)}
                          </td>
                          <td>
                            <ul className="list-clean" style={{ margin: 0 }}>
                              {snippets.slice(0, 3).map((s, i) => (
                                <li key={i} style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>
                                  {String(s).length > 200 ? `${String(s).slice(0, 197)}…` : String(s)}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
