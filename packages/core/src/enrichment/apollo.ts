export type DealSegment = "enterprise" | "mid_tier";

const ENTERPRISE_THRESHOLD = 2000;

export interface CompanyEnrichmentResult {
  employeeCount: number | null;
  segment: DealSegment;
  /** Apollo organization name when enrich succeeds */
  organizationName: string | null;
}

function guessDomainFromCompanyName(companyName: string): string {
  return companyName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}

/**
 * Enrich company by email domain when available (accurate); otherwise guess domain from title-parsed name.
 */
export async function lookupCompanyEnrichment(params: {
  prospectEmailDomain: string | null;
  titleParsedCompanyName: string | null;
}): Promise<CompanyEnrichmentResult> {
  const fallback: CompanyEnrichmentResult = {
    employeeCount: null,
    segment: "mid_tier",
    organizationName: null,
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
      organization?: { estimated_num_employees?: number; name?: string };
    };

    const employeeCount: number | null = data?.organization?.estimated_num_employees ?? null;
    const organizationName: string | null =
      typeof data?.organization?.name === "string" && data.organization.name.trim()
        ? data.organization.name.trim()
        : null;

    const segment: DealSegment =
      employeeCount != null && employeeCount >= ENTERPRISE_THRESHOLD ? "enterprise" : "mid_tier";

    return { employeeCount, segment, organizationName };
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
