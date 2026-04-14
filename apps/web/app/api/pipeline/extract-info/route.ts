import { NextRequest, NextResponse } from "next/server";
import {
  parseMeetingTitle,
  KNOWN_AES,
  canonicalizeAEName,
} from "@transcript-evaluator/core/src/ingestion/mapping";
import {
  extractProspectEmailDomainFromInvitees,
  isOurEmailDomain,
  prospectDomainFromSingleEmail,
  resolveProspectDisplayName,
} from "@transcript-evaluator/core/src/ingestion/prospectIdentity";
import { authenticatePipeline } from "../_auth";

export async function POST(req: NextRequest) {
  const authErr = authenticatePipeline(req);
  if (authErr) return authErr;

  const body = await req.json();

  const title: string = body.title ?? "";
  const recordingId = body.recording_id;

  const invitees: { name?: string; email?: string; is_external?: boolean }[] =
    body.calendar_invitees ?? [];
  const recordedBy: { name?: string; email?: string } | undefined =
    body.recorded_by;

  const flatEmails: string = body.invitees_emails ?? "";
  const recorderEmail: string = body.recorder_email ?? "";

  if (!title || recordingId == null) {
    return NextResponse.json(
      { error: "Payload must include title and recording_id" },
      { status: 400 }
    );
  }

  let companyDomain = extractProspectEmailDomainFromInvitees(invitees);
  if (!companyDomain && flatEmails) {
    const emails = flatEmails.split(",").map((e) => e.trim()).filter(Boolean);
    for (const email of emails) {
      const d = prospectDomainFromSingleEmail(email);
      if (d) {
        companyDomain = d;
        break;
      }
    }
  }

  const companyNameFromTitle = parseMeetingTitle(title);
  const companyDomainGuess = companyNameFromTitle
    ? companyNameFromTitle.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com"
    : null;

  const company_name = resolveProspectDisplayName({
    titleParsedName: companyNameFromTitle,
    emailDomain: companyDomain,
  });

  const allNames: string[] = [];
  for (const inv of invitees) {
    if (inv.name) allNames.push(inv.name);
  }
  if (recordedBy?.name && !allNames.includes(recordedBy.name)) {
    allNames.push(recordedBy.name);
  }

  let aeName =
    allNames.find((n) => canonicalizeAEName(n)) ??
    allNames.find((n) =>
      KNOWN_AES.some((ae) => n.toLowerCase().includes(ae.toLowerCase()))
    ) ??
    null;

  if (!aeName) {
    const consoleEmails: string[] = [];
    if (recorderEmail) consoleEmails.push(recorderEmail);
    if (flatEmails) {
      for (const e of flatEmails.split(",").map((s) => s.trim()).filter(Boolean)) {
        const d = e.split("@")[1]?.toLowerCase();
        if (d && isOurEmailDomain(d)) consoleEmails.push(e);
      }
    }
    for (const email of consoleEmails) {
      const local = email.split("@")[0]?.toLowerCase() ?? "";
      const match = KNOWN_AES.find((ae) => {
        const firstName = ae.split(" ")[0].toLowerCase();
        return local === firstName || local.includes(firstName);
      });
      if (match) { aeName = match; break; }
    }
  }

  const participants = invitees.map((inv) => ({
    name: inv.name ?? "Unknown",
    email: inv.email ?? null,
    is_external: inv.is_external ?? false,
  }));

  const companySearchTerm = companyDomain
    ? companyDomain.replace(/\.[^.]+$/, "")
    : companyNameFromTitle ?? null;

  return NextResponse.json({
    company_domain: companyDomain,
    company_search_term: companySearchTerm,
    company_name,
    company_domain_guess: companyDomainGuess,
    ae_name: aeName,
    recording_id: recordingId,
    meeting_title: title,
    participants,
  });
}
