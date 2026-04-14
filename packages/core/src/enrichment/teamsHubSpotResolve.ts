import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emailDomain,
  isFreeEmailDomain,
  searchCompanyIdByDomain,
  searchCompanyIdByName,
} from "./hubspot";

function companyNameFromSignals(signals: unknown): string | null {
  if (!signals || typeof signals !== "object") return null;
  const account = (signals as Record<string, unknown>).account;
  if (!account || typeof account !== "object") return null;
  const cn = (account as Record<string, unknown>).company_name;
  if (!cn || typeof cn !== "object") return null;
  const v = (cn as Record<string, unknown>).value;
  return typeof v === "string" && v.trim() && v.toLowerCase() !== "unknown" ? v.trim() : null;
}

/**
 * Resolve HubSpot company id for a call: corporate prospect email domain first, then
 * latest extracted_signals account company name search.
 */
export async function resolveHubSpotCompanyIdForCall(
  db: SupabaseClient,
  callId: string
): Promise<{ companyId: string | null; detail: string }> {
  const { data: prospects, error: pErr } = await db
    .from("participants")
    .select("email")
    .eq("call_id", callId)
    .eq("role", "prospect");

  if (pErr) throw pErr;

  const emails = (prospects ?? [])
    .map((p) => (p.email as string | null)?.toLowerCase().trim())
    .filter(Boolean) as string[];

  for (const email of emails) {
    const domain = emailDomain(email);
    if (!domain || isFreeEmailDomain(domain)) continue;
    const id = await searchCompanyIdByDomain(domain);
    if (id) return { companyId: id, detail: `domain:${domain}` };
  }

  const { data: sig, error: sErr } = await db
    .from("extracted_signals")
    .select("signals_json")
    .eq("call_id", callId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sErr) throw sErr;

  const name = companyNameFromSignals(sig?.signals_json);
  if (name) {
    const id = await searchCompanyIdByName(name);
    if (id) return { companyId: id, detail: `companyName:${name}` };
  }

  return { companyId: null, detail: "no_corporate_domain_or_company_match" };
}
