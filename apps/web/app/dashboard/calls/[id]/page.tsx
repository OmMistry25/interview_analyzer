import fs from "node:fs";
import path from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import ReprocessButton from "@/components/ReprocessButton";
import CallDetailTabs from "@/components/CallDetailTabs";
import { KNOWN_AES, canonicalizeAEName } from "@transcript-evaluator/core/src/ingestion/mapping";

export const dynamic = "force-dynamic";

/** Local NDJSON debug log (works with `next dev`; cwd is usually `apps/web`). */
function agentDebugLog(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ sessionId: "2f1d71", timestamp: Date.now(), ...payload }) + "\n";
  const candidates = [
    path.join(process.cwd(), ".cursor", "debug-2f1d71.log"),
    path.join(process.cwd(), "..", ".cursor", "debug-2f1d71.log"),
    path.join(process.cwd(), "..", "..", ".cursor", "debug-2f1d71.log"),
  ];
  for (const p of candidates) {
    try {
      fs.appendFileSync(p, line);
      return;
    } catch {
      // try next path
    }
  }
}

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

  const wfRunQuery = supabase
    .from("workflow_automation_scan_runs")
    .select("id")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [callRes, signalsRes, evalRes, participantsRes, wfRunRes] = await Promise.all([
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
    wfRunQuery,
  ]);

  let workflowScanSnippets: string[] | null = null;
  if (!wfRunRes.error && wfRunRes.data?.id) {
    const { data: wfHit } = await supabase
      .from("workflow_automation_scan_hits")
      .select("snippets")
      .eq("run_id", wfRunRes.data.id)
      .eq("call_id", id)
      .maybeSingle();
    const arr = wfHit?.snippets;
    if (Array.isArray(arr) && arr.length > 0 && arr.every((x) => typeof x === "string")) {
      workflowScanSnippets = arr as string[];
    }
  }

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
  // #region agent log
  agentDebugLog({
    runId: "local",
    hypothesisId: "H1_H2",
    location: "calls/[id]/page.tsx:participants_loaded",
    message: "Loaded participants for call detail",
    data: { callId: id, participants },
  });
  // #endregion

  const aeParticipant =
    participants.find((p) => p.role === "ae" && canonicalizeAEName(p.name)) ??
    participants.find((p) => p.role === "ae" && KNOWN_AES.some((ae) => p.name.toLowerCase().includes(ae.toLowerCase()))) ??
    participants.find((p) => p.role === "ae");
  const aeName = canonicalizeAEName(aeParticipant?.name ?? null) ?? aeParticipant?.name ?? null;
  // #region agent log
  agentDebugLog({
    runId: "local",
    hypothesisId: "H1_H3_H4",
    location: "calls/[id]/page.tsx:ae_resolution",
    message: "Computed AE candidate and canonicalized display name",
    data: {
      callId: id,
      knownAEs: KNOWN_AES,
      aeParticipant: aeParticipant ?? null,
      aeNameResolved: aeName,
    },
  });
  // #endregion
  const accountName =
    (signals as { account?: { company_name?: { value?: string } } })?.account?.company_name?.value ??
    null;

  // #region agent log
  agentDebugLog({
    runId: "local",
    hypothesisId: "H5",
    location: "calls/[id]/page.tsx:render_payload",
    message: "Passing AE/account payload to CallDetailTabs",
    data: {
      callId: id,
      aeName,
      accountName: accountName !== "unknown" ? accountName : null,
    },
  });
  // #endregion

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

      {workflowScanSnippets ? (
        <div className="card" style={{ marginBottom: 20, padding: "14px 18px" }}>
          <p className="page-meta" style={{ margin: 0 }}>
            <strong>Workflow + automation (prospect, latest scan):</strong>{" "}
            {workflowScanSnippets[0].length > 200
              ? `${workflowScanSnippets[0].slice(0, 197)}…`
              : workflowScanSnippets[0]}
          </p>
        </div>
      ) : null}

      <CallDetailTabs
        evaluation={evaluation as Parameters<typeof CallDetailTabs>[0]["evaluation"]}
        signals={signals as Parameters<typeof CallDetailTabs>[0]["signals"]}
        dealBrief={dealBrief}
        consoleUseCases={consoleUseCases as Parameters<typeof CallDetailTabs>[0]["consoleUseCases"]}
        participants={participants}
        aeName={aeName}
        accountName={accountName !== "unknown" ? accountName : null}
      />

      <ReprocessButton callId={id} />
    </div>
  );
}
