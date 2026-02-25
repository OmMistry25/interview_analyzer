import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import ReprocessButton from "@/components/ReprocessButton";

export const dynamic = "force-dynamic";

interface SignalField {
  value: unknown;
  evidence: string[];
}

interface EvaluationJson {
  overall_status: string;
  score: number;
  hard_disqualifiers?: { rule: string; triggered: boolean; evidence_refs: string[] }[];
  yellow_flags?: { flag: string; triggered: boolean; evidence_refs: string[] }[];
  green_signals?: { signal: string; present: boolean; evidence_refs: string[] }[];
  summary?: string;
  missing_critical_info?: string[];
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [callRes, signalsRes, evalRes] = await Promise.all([
    supabase.from("calls").select("*").eq("id", id).single(),
    supabase
      .from("extracted_signals")
      .select("signals_json, quality_checks")
      .eq("call_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("evaluations")
      .select("overall_status, score, evaluation_json")
      .eq("call_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (callRes.error || !callRes.data) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>Call not found.</div>;
  }

  const call = callRes.data;
  const signals = signalsRes.data?.signals_json as Record<string, SignalField> | null;
  const evaluation = evalRes.data?.evaluation_json as EvaluationJson | null;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 960, margin: "0 auto" }}>
      <Link href="/dashboard/calls" style={{ color: "#0066cc", marginBottom: 16, display: "inline-block" }}>
        &larr; Back to Calls
      </Link>

      <h1>{call.title}</h1>
      <p style={{ color: "#666" }}>
        {call.start_time ? new Date(call.start_time).toLocaleString() : "No date"}{" "}
        &middot; Source: {call.source}
      </p>

      {/* Evaluation Summary */}
      {evaluation && (
        <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>
            Evaluation:{" "}
            <span style={{ color: statusColor(evaluation.overall_status) }}>
              {evaluation.overall_status}
            </span>{" "}
            (Score: {evaluation.score})
          </h2>
          {evaluation.summary && <p>{evaluation.summary}</p>}

          {/* Hard Disqualifiers */}
          {evaluation.hard_disqualifiers && evaluation.hard_disqualifiers.some((d) => d.triggered) && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ color: "#dc2626" }}>Hard Disqualifiers</h3>
              <ul>
                {evaluation.hard_disqualifiers
                  .filter((d) => d.triggered)
                  .map((d, i) => (
                    <li key={i}>
                      {d.rule}
                      {d.evidence_refs.length > 0 && (
                        <EvidenceQuotes signalKeys={d.evidence_refs} signals={signals} />
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Yellow Flags */}
          {evaluation.yellow_flags && evaluation.yellow_flags.some((f) => f.triggered) && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ color: "#ca8a04" }}>Yellow Flags</h3>
              <ul>
                {evaluation.yellow_flags
                  .filter((f) => f.triggered)
                  .map((f, i) => (
                    <li key={i}>
                      {f.flag}
                      {f.evidence_refs.length > 0 && (
                        <EvidenceQuotes signalKeys={f.evidence_refs} signals={signals} />
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Green Signals */}
          {evaluation.green_signals && evaluation.green_signals.some((s) => s.present) && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ color: "#16a34a" }}>Green Signals</h3>
              <ul>
                {evaluation.green_signals
                  .filter((s) => s.present)
                  .map((s, i) => (
                    <li key={i}>
                      {s.signal}
                      {s.evidence_refs.length > 0 && (
                        <EvidenceQuotes signalKeys={s.evidence_refs} signals={signals} />
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Missing Info */}
          {evaluation.missing_critical_info && evaluation.missing_critical_info.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Missing Info (for next call)</h3>
              <ul>
                {evaluation.missing_critical_info.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Extracted Signals Table */}
      {signals && (
        <section style={{ marginTop: 24 }}>
          <h2>Extracted Signals</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: 8 }}>Signal</th>
                <th style={{ padding: 8 }}>Value</th>
                <th style={{ padding: 8 }}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(signals).map(([key, field]) => (
                <tr key={key} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8, fontWeight: 500 }}>{key.replace(/_/g, " ")}</td>
                  <td style={{ padding: 8 }}>
                    {Array.isArray(field.value) ? field.value.join(", ") || "—" : String(field.value)}
                  </td>
                  <td style={{ padding: 8, fontSize: 13, color: "#555" }}>
                    {field.evidence.length > 0
                      ? field.evidence.map((q, i) => (
                          <blockquote key={i} style={{ margin: "4px 0", paddingLeft: 8, borderLeft: "3px solid #ddd" }}>
                            &ldquo;{q}&rdquo;
                          </blockquote>
                        ))
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!evaluation && !signals && (
        <p style={{ marginTop: 24, color: "#888" }}>Processing not yet completed for this call.</p>
      )}

      <ReprocessButton callId={id} />
    </div>
  );
}

function EvidenceQuotes({
  signalKeys,
  signals,
}: {
  signalKeys: string[];
  signals: Record<string, SignalField> | null;
}) {
  if (!signals) return null;

  const quotes = signalKeys.flatMap((key) => signals[key]?.evidence ?? []);
  if (quotes.length === 0) return null;

  return (
    <div style={{ marginTop: 4, marginLeft: 16 }}>
      {quotes.map((q, i) => (
        <blockquote key={i} style={{ margin: "2px 0", paddingLeft: 8, borderLeft: "3px solid #ddd", fontSize: 13, color: "#555" }}>
          &ldquo;{q}&rdquo;
        </blockquote>
      ))}
    </div>
  );
}

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    Qualified: "#16a34a",
    Yellow: "#ca8a04",
    Disqualified: "#dc2626",
    "Needs Review": "#9333ea",
  };
  return colors[status] ?? "#888";
}
