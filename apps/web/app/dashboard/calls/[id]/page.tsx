import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import ReprocessButton from "@/components/ReprocessButton";
import CallDetailTabs from "@/components/CallDetailTabs";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [callRes, signalsRes, evalRes, participantsRes] = await Promise.all([
    supabase.from("calls").select("*").eq("id", id).single(),
    supabase
      .from("extracted_signals")
      .select("signals_json")
      .eq("call_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("evaluations")
      .select("overall_status, score, stage_1_probability, evaluation_json")
      .eq("call_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("participants")
      .select("name, role")
      .eq("call_id", id),
  ]);

  if (callRes.error || !callRes.data) {
    return (
      <div className="page-container">
        <p className="feedback-error">Call not found.</p>
      </div>
    );
  }

  const call = callRes.data;
  const signals = signalsRes.data?.signals_json as Record<string, unknown> | null;
  const evaluation = evalRes.data?.evaluation_json as Record<string, unknown> | null;
  const participants = (participantsRes.data ?? []) as { name: string; role: string }[];

  const knownAEs = ["Sam Vila", "Eric Bower", "Christian", "Michael"];
  const aeParticipant =
    participants.find((p) => p.role === "ae" && knownAEs.some((ae) => p.name.toLowerCase().includes(ae.toLowerCase()))) ??
    participants.find((p) => p.role === "ae");
  const accountName =
    (signals as { account?: { company_name?: { value?: string } } })?.account?.company_name?.value ??
    null;

  return (
    <div className="page-container">
      <Link href="/dashboard/calls" className="breadcrumb">
        &larr; Back to Calls
      </Link>

      <div className="page-header">
        <h1>{call.title}</h1>
        <p className="page-meta">
          {call.start_time ? new Date(call.start_time).toLocaleString() : "No date"}{" "}
          &middot; Source: {call.source}
        </p>
      </div>

      <CallDetailTabs
        evaluation={evaluation as Parameters<typeof CallDetailTabs>[0]["evaluation"]}
        signals={signals as Parameters<typeof CallDetailTabs>[0]["signals"]}
        participants={participants}
        aeName={aeParticipant?.name ?? null}
        accountName={accountName !== "unknown" ? accountName : null}
      />

      <ReprocessButton callId={id} />
    </div>
  );
}
