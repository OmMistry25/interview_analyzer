import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import ImportMeetingForm from "@/components/ImportMeetingForm";

export const dynamic = "force-dynamic";

interface CallRow {
  id: string;
  title: string;
  start_time: string | null;
  source: string;
  evaluations: {
    overall_status: string;
    score: number;
    stage_1_probability: number | null;
    created_at: string;
  }[];
}

export default async function CallsListPage() {
  const supabase = await createSupabaseServerClient();

  const { data: calls, error } = await supabase
    .from("calls")
    .select("id, title, start_time, source, evaluations(overall_status, score, stage_1_probability, created_at)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="page-container">
        <p className="feedback-error">Error loading calls: {error.message}</p>
      </div>
    );
  }

  const typedCalls = (calls ?? []) as CallRow[];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Calls</h1>
      </div>

      <ImportMeetingForm />

      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Date</th>
            <th>Status</th>
            <th>Stage 1</th>
          </tr>
        </thead>
        <tbody>
          {typedCalls.map((call) => {
            const sorted = [...(call.evaluations ?? [])].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            const eval_ = sorted[0];
            return (
              <tr key={call.id}>
                <td>
                  <Link href={`/dashboard/calls/${call.id}`}>
                    {call.title}
                  </Link>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>
                  {call.start_time ? new Date(call.start_time).toLocaleDateString() : "—"}
                </td>
                <td>
                  <StatusBadge status={eval_?.overall_status} />
                </td>
                <td>
                  {eval_?.stage_1_probability != null ? (
                    <ProbabilityBadge value={eval_.stage_1_probability} />
                  ) : (
                    <span style={{ color: "var(--text-tertiary)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {typedCalls.length === 0 && (
            <tr>
              <td colSpan={4} className="table-empty">
                No calls yet. Import a Fathom meeting link above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="badge badge-gray">Pending</span>;

  const cls: Record<string, string> = {
    Qualified: "badge-green",
    "Needs Work": "badge-amber",
    Unqualified: "badge-red",
  };

  return <span className={`badge ${cls[status] ?? "badge-gray"}`}>{status}</span>;
}

function ProbabilityBadge({ value }: { value: number }) {
  let cls = "badge-red";
  if (value >= 61) cls = "badge-green";
  else if (value >= 41) cls = "badge-amber";

  return <span className={`badge ${cls}`}>{value}%</span>;
}
