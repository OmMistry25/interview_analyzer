import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  qualified_call_count: number;
  scanned_count: number;
  hit_count: number;
  scanner_version: string;
}

type CallEmbed = { id: string; title: string; start_time: string | null };

interface HitRow {
  call_id: string;
  snippets: string[];
  phrase_mention_count?: number | null;
  calls: CallEmbed | CallEmbed[] | null;
}

function callFromHit(hit: HitRow): CallEmbed | null {
  const c = hit.calls;
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

export default async function WorkflowScanPage() {
  const supabase = await createSupabaseServerClient();

  const { data: latestRun, error: runError } = await supabase
    .from("workflow_automation_scan_runs")
    .select(
      "id, started_at, finished_at, qualified_call_count, scanned_count, hit_count, scanner_version"
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
      .from("workflow_automation_scan_hits")
      .select("call_id, snippets, phrase_mention_count, calls ( id, title, start_time )")
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
  const totalPhraseMentions = hits.reduce(
    (sum, h) => sum + (typeof h.phrase_mention_count === "number" ? h.phrase_mention_count : 1),
    0
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Workflow + automation scan</h1>
        <p className="page-meta">
          Qualified calls only; prospect (attendee) speech; adjacent phrase{" "}
          <code>workflow automation</code> or <code>workflow-automation</code> only (no other words
          between; order preserved) — lexical match, no LLM.
        </p>
      </div>

      {!run ? (
        <section className="card">
          <p className="page-meta" style={{ marginBottom: 0 }}>
            No completed scan yet. Run locally from the repo:{" "}
            <code>npm run scan:workflow-automation</code> in <code>packages/core</code> (requires{" "}
            <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in the root{" "}
            <code>.env</code>).
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
                <strong>Qualified calls (latest eval):</strong> {run.qualified_call_count}
              </li>
              <li>
                <strong>Scanned:</strong> {run.scanned_count}
              </li>
              <li>
                <strong>Calls with phrase (hits):</strong> {run.hit_count}{" "}
                {scanned > 0 ? <span className="page-meta">({rate}% of scanned)</span> : null}
              </li>
              <li>
                <strong>Total phrase mentions:</strong> {totalPhraseMentions}{" "}
                <span className="page-meta">(sum across hit calls)</span>
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
              Refresh results after a new scan: <code>npm run scan:workflow-automation</code> in{" "}
              <code>packages/core</code>.
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
                      <th>Snippets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((h) => {
                      const call = callFromHit(h);
                      const title = call?.title ?? "Untitled";
                      const callHref = `/dashboard/calls/${h.call_id}`;
                      const snippets = Array.isArray(h.snippets) ? h.snippets : [];
                      const mentionCount =
                        typeof h.phrase_mention_count === "number" ? h.phrase_mention_count : 1;
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
                          <td>{mentionCount}</td>
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
