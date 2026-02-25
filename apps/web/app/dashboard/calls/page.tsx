import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

interface CallRow {
  id: string;
  title: string;
  start_time: string | null;
  source: string;
  evaluations: { overall_status: string; score: number }[];
}

export default async function CallsListPage() {
  const supabase = await createSupabaseServerClient();

  const { data: calls, error } = await supabase
    .from("calls")
    .select("id, title, start_time, source, evaluations(overall_status, score)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>Error loading calls: {error.message}</div>;
  }

  const typedCalls = (calls ?? []) as CallRow[];

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 24 }}>Calls</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Title</th>
            <th style={{ padding: 8 }}>Date</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {typedCalls.map((call) => {
            const eval_ = call.evaluations?.[0];
            return (
              <tr key={call.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>
                  <Link href={`/dashboard/calls/${call.id}`} style={{ color: "#0066cc" }}>
                    {call.title}
                  </Link>
                </td>
                <td style={{ padding: 8 }}>
                  {call.start_time ? new Date(call.start_time).toLocaleDateString() : "—"}
                </td>
                <td style={{ padding: 8 }}>
                  <StatusBadge status={eval_?.overall_status} />
                </td>
                <td style={{ padding: 8 }}>{eval_?.score ?? "—"}</td>
              </tr>
            );
          })}
          {typedCalls.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#888" }}>
                No calls yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span style={{ color: "#888" }}>Pending</span>;

  const colors: Record<string, string> = {
    Qualified: "#16a34a",
    Yellow: "#ca8a04",
    Disqualified: "#dc2626",
    "Needs Review": "#9333ea",
  };

  return (
    <span style={{ color: colors[status] ?? "#888", fontWeight: 600 }}>
      {status}
    </span>
  );
}
