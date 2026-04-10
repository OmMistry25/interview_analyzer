import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import ReprocessButton from "@/components/ReprocessButton";
import CallDetailTabs from "@/components/CallDetailTabs";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  // Default on; set NEXT_PUBLIC_DEAL_BRIEF_UI_ENABLED=false to hide tab / skip selecting deal_brief_json
  const dealBriefUiEnabled = process.env.NEXT_PUBLIC_DEAL_BRIEF_UI_ENABLED !== "false";
  const consoleUseCasesUiEnabled = process.env.NEXT_PUBLIC_CONSOLE_USE_CASES_UI_ENABLED !== "false";

  const signalsSelectFields = ["signals_json"];
  if (dealBriefUiEnabled) signalsSelectFields.push("deal_brief_json");
  if (consoleUseCasesUiEnabled) signalsSelectFields.push("console_use_cases_json");

  const signalsQuery = supabase
    .from("extracted_signals")
    .select(signalsSelectFields.join(", "))
    .eq("call_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [callRes, signalsRes, evalRes, participantsRes] = await Promise.all([
    supabase.from("calls").select("*").eq("id", id).single(),
    signalsQuery,
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
  const signalsRow = signalsRes.data as {
    signals_json?: unknown;
    deal_brief_json?: unknown;
    console_use_cases_json?: unknown;
  } | null;
  const signals = (signalsRow?.signals_json ?? null) as Record<string, unknown> | null;
  const dealBrief = dealBriefUiEnabled
    ? ((signalsRow?.deal_brief_json ?? null) as Record<string, unknown> | null)
    : null;
  const consoleUseCases = consoleUseCasesUiEnabled
    ? ((signalsRow?.console_use_cases_json ?? null) as Record<string, unknown> | null)
    : undefined;
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
        dealBrief={dealBrief}
        consoleUseCases={consoleUseCases as Parameters<typeof CallDetailTabs>[0]["consoleUseCases"]}
        participants={participants}
        aeName={aeParticipant?.name ?? null}
        accountName={accountName !== "unknown" ? accountName : null}
      />

      <ReprocessButton callId={id} />
    </div>
  );
}
