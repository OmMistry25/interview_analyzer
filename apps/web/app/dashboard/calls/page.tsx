import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import ImportMeetingForm from "@/components/ImportMeetingForm";
import CallsFilters from "./CallsFilters";

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

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function CallsListPage({ searchParams }: Props) {
  const params = await searchParams;
  const statusFilter = params.status ?? "";
  const dateFrom = params.from ?? "";
  const dateTo = params.to ?? "";

  const supabase = await createSupabaseServerClient();

  const isEvalStatus = ["Qualified", "Needs Work", "Unqualified"].includes(statusFilter);

  const selectCols = "id, title, start_time, source";
  const evalCols = "overall_status, score, stage_1_probability, created_at";
  const selectStr = isEvalStatus
    ? `${selectCols}, evaluations!inner(${evalCols})`
    : `${selectCols}, evaluations(${evalCols})`;

  let query = supabase
    .from("calls")
    .select(selectStr)
    .order("created_at", { ascending: false })
    .limit(500);

  if (isEvalStatus) {
    query = query.eq("evaluations.overall_status", statusFilter);
  }
  if (dateFrom) {
    query = query.gte("start_time", new Date(dateFrom).toISOString());
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setDate(to.getDate() + 1);
    query = query.lt("start_time", to.toISOString());
  }

  const { data: calls, error } = await query;

  if (error) {
    return (
      <div className="page-container">
        <p className="feedback-error">Error loading calls: {error.message}</p>
      </div>
    );
  }

  let typedCalls = (calls ?? []) as CallRow[];

  if (statusFilter === "Pending") {
    typedCalls = typedCalls.filter((c) => !c.evaluations || c.evaluations.length === 0);
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Calls</h1>
        <p className="page-meta">{typedCalls.length} calls</p>
      </div>

      <ImportMeetingForm />

      <CallsFilters
        currentStatus={statusFilter}
        currentFrom={dateFrom}
        currentTo={dateTo}
      />

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
                No calls match the current filters.
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
