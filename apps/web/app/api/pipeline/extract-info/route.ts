import { NextRequest, NextResponse } from "next/server";
import { parseMeetingTitle, KNOWN_AES } from "@transcript-evaluator/core/src/ingestion/mapping";
import { authenticatePipeline } from "../_auth";

const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "protonmail.com", "mail.com",
  "live.com", "msn.com", "ymail.com",
]);

function extractExternalDomain(
  invitees: { email?: string; is_external?: boolean }[]
): string | null {
  for (const inv of invitees) {
    if (!inv.is_external || !inv.email) continue;
    const domain = inv.email.split("@")[1]?.toLowerCase();
    if (domain && !GENERIC_DOMAINS.has(domain)) return domain;
  }
  return null;
}

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

  if (!title || recordingId == null) {
    return NextResponse.json(
      { error: "Payload must include title and recording_id" },
      { status: 400 }
    );
  }

  const companyDomain = extractExternalDomain(invitees);

  const companyNameFromTitle = parseMeetingTitle(title);
  const companyDomainGuess = companyNameFromTitle
    ? companyNameFromTitle.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com"
    : null;

  const allNames: string[] = [];
  for (const inv of invitees) {
    if (inv.name) allNames.push(inv.name);
  }
  if (recordedBy?.name && !allNames.includes(recordedBy.name)) {
    allNames.push(recordedBy.name);
  }

  const aeName =
    allNames.find((n) =>
      KNOWN_AES.some((ae) => n.toLowerCase().includes(ae.toLowerCase()))
    ) ?? null;

  const participants = invitees.map((inv) => ({
    name: inv.name ?? "Unknown",
    email: inv.email ?? null,
    is_external: inv.is_external ?? false,
  }));

  return NextResponse.json({
    company_domain: companyDomain,
    company_name: companyNameFromTitle,
    company_domain_guess: companyDomainGuess,
    ae_name: aeName,
    recording_id: recordingId,
    meeting_title: title,
    participants,
  });
}
