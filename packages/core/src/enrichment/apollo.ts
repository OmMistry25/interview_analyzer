export type DealSegment = "enterprise" | "mid_tier";

const ENTERPRISE_THRESHOLD = 2000;

export interface CompanyEnrichmentResult {
  employeeCount: number | null;
  segment: DealSegment;
}

function guessDomainFromCompanyName(companyName: string): string {
  return companyName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}

/**
 * Apollo **only** for estimated headcount → enterprise vs mid_tier. Display name comes from
 * `resolveProspectDisplayName` (email domain label + title) — we do not use Apollo org name (saves noise and avoids using credits for labeling).
 */
export async function lookupCompanyEnrichment(params: {
  prospectEmailDomain: string | null;
  titleParsedCompanyName: string | null;
}): Promise<CompanyEnrichmentResult> {
  const fallback: CompanyEnrichmentResult = {
    employeeCount: null,
    segment: "mid_tier",
  };

  const domain =
    params.prospectEmailDomain?.trim() ||
    (params.titleParsedCompanyName ? guessDomainFromCompanyName(params.titleParsedCompanyName) : null);

  if (!domain) return fallback;

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn("  APOLLO_API_KEY not set — defaulting to mid_tier");
    return fallback;
  }

  try {
    const res = await fetch(
      `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { headers: { "x-api-key": apiKey, "Content-Type": "application/json" } }
    );

    if (!res.ok) {
      console.warn(`  Apollo API returned ${res.status} for ${domain} — defaulting to mid_tier`);
      return fallback;
    }

    const data = (await res.json()) as {
      organization?: { estimated_num_employees?: number };
    };

    const employeeCount: number | null = data?.organization?.estimated_num_employees ?? null;

    const segment: DealSegment =
      employeeCount != null && employeeCount >= ENTERPRISE_THRESHOLD ? "enterprise" : "mid_tier";

    return { employeeCount, segment };
  } catch (err) {
    console.warn(`  Apollo enrichment failed for ${domain}:`, err);
    return fallback;
  }
}

/** @deprecated Use lookupCompanyEnrichment; kept for any external callers passing name-only. */
export async function lookupCompanySize(companyName: string | null): Promise<CompanyEnrichmentResult> {
  return lookupCompanyEnrichment({
    prospectEmailDomain: null,
    titleParsedCompanyName: companyName,
  });
}
