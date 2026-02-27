"use client";

import { Fragment, useState } from "react";

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

interface Props {
  initialPhrases: PhraseRow[];
  initialRuns: RunRow[];
  totalCallsAnalyzed: number;
  latestRunId: string | null;
}

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "problem_descriptions", label: "Problem Descriptions" },
  { value: "solution_seeking", label: "Solution Seeking" },
  { value: "pain_language", label: "Pain Language" },
  { value: "feature_mentions", label: "Feature Mentions" },
  { value: "search_intent", label: "Search Intent" },
];

const CATEGORY_COLORS: Record<string, string> = {
  problem_descriptions: "badge-red",
  solution_seeking: "badge-blue",
  pain_language: "badge-amber",
  feature_mentions: "badge-green",
  search_intent: "badge-gray",
};

const RUN_TYPE_LABELS: Record<string, string> = {
  daily_extraction: "Daily Extraction",
  weekly_analysis: "Weekly Analysis",
  backfill: "Backfill",
};

export default function GeoAnalysisDashboard({
  initialPhrases,
  initialRuns,
  totalCallsAnalyzed,
  latestRunId,
}: Props) {
  const [phrases] = useState(initialPhrases);
  const [runs] = useState(initialRuns);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [expandedPhrase, setExpandedPhrase] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [triggerMessage, setTriggerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showRunHistory, setShowRunHistory] = useState(false);

  const filteredPhrases = selectedCategory
    ? phrases.filter((p) => p.category === selectedCategory)
    : phrases;

  const uniquePhrases = phrases.length;
  const categoryCounts = phrases.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  async function handleTrigger(type: "daily" | "weekly" | "backfill") {
    setTriggerLoading(type);
    setTriggerMessage(null);

    try {
      const endpoint = type === "weekly" ? "/api/geo-analysis/weekly" : "/api/geo-analysis/trigger";
      const body = type === "weekly" ? {} : { backfill: type === "backfill" };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setTriggerMessage({ type: "success", text: `Job queued (ID: ${data.job_id})` });
      } else {
        setTriggerMessage({ type: "error", text: data.error ?? "Failed to trigger" });
      }
    } catch (err) {
      setTriggerMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setTriggerLoading(null);
    }
  }

  return (
    <>
      {/* Summary stats */}
      <div className="geo-stats-grid">
        <div className="card geo-stat-card">
          <div className="geo-stat-value">{totalCallsAnalyzed}</div>
          <div className="geo-stat-label">Calls Analyzed</div>
        </div>
        <div className="card geo-stat-card">
          <div className="geo-stat-value">{uniquePhrases}</div>
          <div className="geo-stat-label">Unique Phrases</div>
        </div>
        <div className="card geo-stat-card">
          <div className="geo-stat-value">{Object.keys(categoryCounts).length}</div>
          <div className="geo-stat-label">Categories</div>
        </div>
        <div className="card geo-stat-card">
          <div className="geo-stat-value">
            {latestRunId ? runs.find((r) => r.type === "weekly_analysis" && r.status === "succeeded")
              ? new Date(runs.find((r) => r.type === "weekly_analysis" && r.status === "succeeded")!.finished_at!).toLocaleDateString()
              : "—"
            : "—"}
          </div>
          <div className="geo-stat-label">Last Weekly Run</div>
        </div>
      </div>

      {/* Actions */}
      <div className="geo-actions mt-24">
        <button
          className="btn btn-primary"
          disabled={triggerLoading !== null}
          onClick={() => handleTrigger("backfill")}
        >
          {triggerLoading === "backfill" ? "Queuing..." : "Run Backfill"}
        </button>
        <button
          className="btn"
          disabled={triggerLoading !== null}
          onClick={() => handleTrigger("daily")}
        >
          {triggerLoading === "daily" ? "Queuing..." : "Run Daily Extraction"}
        </button>
        <button
          className="btn"
          disabled={triggerLoading !== null}
          onClick={() => handleTrigger("weekly")}
        >
          {triggerLoading === "weekly" ? "Queuing..." : "Run Weekly Analysis"}
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setShowRunHistory(!showRunHistory)}
          style={{ marginLeft: "auto" }}
        >
          {showRunHistory ? "Hide" : "Show"} Run History
        </button>
      </div>

      {triggerMessage && (
        <p className={`mt-16 ${triggerMessage.type === "success" ? "feedback-success" : "feedback-error"}`}>
          {triggerMessage.text}
        </p>
      )}

      {/* Run history */}
      {showRunHistory && (
        <div className="mt-24">
          <h3 className="section-title">Run History</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Calls</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{RUN_TYPE_LABELS[run.type] ?? run.type}</td>
                  <td>
                    <span className={`badge ${run.status === "succeeded" ? "badge-green" : run.status === "failed" ? "badge-red" : run.status === "running" ? "badge-amber" : "badge-gray"}`}>
                      {run.status}
                    </span>
                  </td>
                  <td>{run.calls_processed}</td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {new Date(run.started_at).toLocaleString()}
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {run.finished_at
                      ? `${Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                      : "—"}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">No runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Category filter */}
      <div className="geo-filter-bar mt-24">
        <h2 className="section-title">Phrase Rankings</h2>
        <div className="geo-category-filters">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              className={`btn btn-sm ${selectedCategory === cat.value ? "btn-primary" : ""}`}
              onClick={() => setSelectedCategory(cat.value)}
            >
              {cat.label}
              {cat.value && categoryCounts[cat.value] ? ` (${categoryCounts[cat.value]})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Phrase table */}
      <table className="table mt-16">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Phrase</th>
            <th>Category</th>
            <th>Frequency</th>
            <th>Calls</th>
          </tr>
        </thead>
        <tbody>
          {filteredPhrases.map((p, i) => (
            <Fragment key={p.id}>
              <tr
                onClick={() => setExpandedPhrase(expandedPhrase === p.id ? null : p.id)}
                style={{ cursor: "pointer" }}
              >
                <td style={{ color: "var(--text-tertiary)" }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{p.phrase}</td>
                <td>
                  <span className={`badge ${CATEGORY_COLORS[p.category] ?? "badge-gray"}`}>
                    {p.category.replace(/_/g, " ")}
                  </span>
                </td>
                <td>
                  <span title={`${p.frequency} this week / ${p.cumulative_frequency} total`}>
                    {p.cumulative_frequency}
                  </span>
                </td>
                <td>
                  <span title={`${p.call_count} this week / ${p.cumulative_call_count} total`}>
                    {p.cumulative_call_count}
                  </span>
                </td>
              </tr>
              {expandedPhrase === p.id && p.example_contexts.length > 0 && (
                <tr>
                  <td colSpan={5} style={{ background: "var(--bg-secondary)", padding: "12px 16px" }}>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                      Evidence from calls:
                    </div>
                    {p.example_contexts.map((ctx, j) => (
                      <div key={j} className="evidence-quote" style={{ marginBottom: 8 }}>
                        <div>&ldquo;{ctx.quote}&rdquo;</div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                          — {ctx.speaker} &middot; {ctx.context}
                        </div>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {filteredPhrases.length === 0 && (
            <tr>
              <td colSpan={5} className="table-empty">
                {phrases.length === 0
                  ? "No phrase data yet. Run a backfill + weekly analysis to see results."
                  : "No phrases in this category."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
