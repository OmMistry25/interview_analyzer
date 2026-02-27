export interface HubSpotDeal {
  dealId: string;
  dealName: string;
  companyName: string | null;
  contactEmails: string[];
}

interface HubSpotSearchResponse {
  total: number;
  results: {
    id: string;
    properties: Record<string, string | null>;
  }[];
  paging?: { next?: { after: string } };
}

interface HubSpotAssociationResponse {
  results: { id: string; type: string }[];
}

interface HubSpotObjectResponse {
  id: string;
  properties: Record<string, string | null>;
}

const HUBSPOT_API = "https://api.hubapi.com";
const RATE_LIMIT_DELAY_MS = 110; // ~9 requests/sec to stay under 100/10s limit

function getApiKey(): string {
  const key = process.env.HUBSPOT_API_KEY;
  if (!key) throw new Error("HUBSPOT_API_KEY not set");
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hubspotFetch<T>(path: string, options?: RequestInit): Promise<T> {
  await sleep(RATE_LIMIT_DELAY_MS);

  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  // Retry on 429 with backoff
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "10", 10);
    console.warn(`  [HubSpot] Rate limited, retrying in ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return hubspotFetch<T>(path, options);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch all deals that went through a pipeline (any stage).
 * Every deal in the sales pipeline had a first meeting (stage 0 call),
 * regardless of where the deal currently sits.
 */
export async function fetchStageZeroDeals(
  pipelineId: string,
  _stageId: string
): Promise<HubSpotDeal[]> {
  const deals: HubSpotDeal[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: pipelineId },
          ],
        },
      ],
      properties: ["dealname"],
      limit: 100,
      ...(after ? { after } : {}),
    };

    const data = await hubspotFetch<HubSpotSearchResponse>(
      "/crm/v3/objects/deals/search",
      { method: "POST", body: JSON.stringify(body) }
    );

    console.log(`  [HubSpot] Fetched page of ${data.results.length} deals (total: ${data.total})`);

    for (const deal of data.results) {
      const enriched = await enrichDeal(deal.id, deal.properties.dealname ?? "");
      deals.push(enriched);
    }

    after = data.paging?.next?.after;
  } while (after);

  return deals;
}

async function enrichDeal(dealId: string, dealName: string): Promise<HubSpotDeal> {
  const [companyName, contactEmails] = await Promise.all([
    fetchAssociatedCompanyName(dealId),
    fetchAssociatedContactEmails(dealId),
  ]);
  return { dealId, dealName, companyName, contactEmails };
}

async function fetchAssociatedCompanyName(dealId: string): Promise<string | null> {
  try {
    const assoc = await hubspotFetch<HubSpotAssociationResponse>(
      `/crm/v3/objects/deals/${dealId}/associations/companies`
    );
    if (assoc.results.length === 0) return null;

    const companyId = assoc.results[0].id;
    const company = await hubspotFetch<HubSpotObjectResponse>(
      `/crm/v3/objects/companies/${companyId}?properties=name`
    );
    return company.properties.name ?? null;
  } catch {
    return null;
  }
}

async function fetchAssociatedContactEmails(dealId: string): Promise<string[]> {
  try {
    const assoc = await hubspotFetch<HubSpotAssociationResponse>(
      `/crm/v3/objects/deals/${dealId}/associations/contacts`
    );
    if (assoc.results.length === 0) return [];

    const emails: string[] = [];
    for (const contact of assoc.results) {
      const detail = await hubspotFetch<HubSpotObjectResponse>(
        `/crm/v3/objects/contacts/${contact.id}?properties=email`
      );
      if (detail.properties.email) {
        emails.push(detail.properties.email.toLowerCase());
      }
    }
    return emails;
  } catch {
    return [];
  }
}

/**
 * Match HubSpot deals to calls in our database.
 * Returns call IDs that correspond to stage 0 deals.
 */
export async function matchDealsToCallIds(
  db: import("@supabase/supabase-js").SupabaseClient,
  deals: HubSpotDeal[]
): Promise<string[]> {
  if (deals.length === 0) return [];

  const allEmails = deals.flatMap((d) => d.contactEmails).filter(Boolean);
  const allCompanyNames = deals.map((d) => d.companyName).filter(Boolean) as string[];

  const matchedCallIds = new Set<string>();

  // Primary match: by participant email (batched to avoid URL length limits)
  if (allEmails.length > 0) {
    const BATCH = 50;
    for (let i = 0; i < allEmails.length; i += BATCH) {
      const emailBatch = allEmails.slice(i, i + BATCH);
      const { data: participants } = await db
        .from("participants")
        .select("call_id, email")
        .eq("role", "prospect")
        .in("email", emailBatch);

      for (const p of participants ?? []) {
        if (p.email && allEmails.includes(p.email.toLowerCase())) {
          matchedCallIds.add(p.call_id);
        }
      }
    }
  }

  // Fallback: by company name in call title (using ILIKE for fuzzy matching)
  if (allCompanyNames.length > 0) {
    const { data: calls } = await db
      .from("calls")
      .select("id, title");

    for (const call of calls ?? []) {
      const titleLower = (call.title as string).toLowerCase();
      for (const company of allCompanyNames) {
        if (titleLower.includes(company.toLowerCase())) {
          matchedCallIds.add(call.id);
          break;
        }
      }
    }
  }

  return Array.from(matchedCallIds);
}
