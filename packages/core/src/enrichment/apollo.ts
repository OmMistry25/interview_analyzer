export type DealSegment = "enterprise" | "mid_tier";

const ENTERPRISE_THRESHOLD = 2000;

interface ApolloEnrichmentResult {
  employeeCount: number | null;
  segment: DealSegment;
}

function guessDomain(companyName: string): string {
  return companyName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}

export async function lookupCompanySize(
  companyName: string | null
): Promise<ApolloEnrichmentResult> {
  const fallback: ApolloEnrichmentResult = { employeeCount: null, segment: "mid_tier" };

  if (!companyName) return fallback;

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn("  APOLLO_API_KEY not set — defaulting to mid_tier");
    return fallback;
  }

  const domain = guessDomain(companyName);

  try {
    const res = await fetch(
      `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { headers: { "x-api-key": apiKey, "Content-Type": "application/json" } }
    );

    if (!res.ok) {
      console.warn(`  Apollo API returned ${res.status} for ${domain} — defaulting to mid_tier`);
      return fallback;
    }

    const data = await res.json();
    const employeeCount: number | null =
      data?.organization?.estimated_num_employees ?? null;

    const segment: DealSegment =
      employeeCount != null && employeeCount >= ENTERPRISE_THRESHOLD
        ? "enterprise"
        : "mid_tier";

    return { employeeCount, segment };
  } catch (err) {
    console.warn(`  Apollo enrichment failed for ${domain}:`, err);
    return fallback;
  }
}
