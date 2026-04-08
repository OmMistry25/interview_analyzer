/**
 * Prospect company identity from calendar emails + title hints.
 * Keep in sync with pipeline extract-info consumer domains.
 */

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "protonmail.com",
  "mail.com",
  "live.com",
  "msn.com",
  "ymail.com",
]);

const OUR_DOMAIN = "console.com";

export function isOurEmailDomain(domain: string): boolean {
  return domain.toLowerCase() === OUR_DOMAIN;
}

function domainFromEmail(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return null;
  if (GENERIC_DOMAINS.has(domain)) return null;
  if (isOurEmailDomain(domain)) return null;
  return domain;
}

/** Single address (e.g. from a CSV list); excludes generic and Console domains. */
export function prospectDomainFromSingleEmail(email: string): string | null {
  return domainFromEmail(email.trim());
}

/** Dominant email domain among prospect-role participants (by frequency). */
export function extractProspectEmailDomainFromParticipants(
  participants: { email: string | null; role: "ae" | "prospect" | "unknown" }[]
): string | null {
  const counts = new Map<string, number>();
  for (const p of participants) {
    if (p.role !== "prospect" || !p.email) continue;
    const d = domainFromEmail(p.email);
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [d, n] of counts) {
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

/** Fathom-style invitees: external flag + email. */
export function extractProspectEmailDomainFromInvitees(
  invitees: { email?: string; is_external?: boolean }[]
): string | null {
  const counts = new Map<string, number>();
  for (const inv of invitees) {
    if (!inv.is_external || !inv.email) continue;
    const d = domainFromEmail(inv.email);
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [d, n] of counts) {
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

function titleCaseBrand(label: string): string {
  return label
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Fallback display string from domain when Apollo/title unavailable (best-effort). */
export function displayNameFromEmailDomain(domain: string): string {
  const host = domain.toLowerCase().trim().replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length === 0) return domain;
  // acme.com → acme; sub.acme.com → acme
  let idx = parts.length >= 2 ? parts.length - 2 : 0;
  if (parts.length >= 3 && parts[parts.length - 2] === "co" && parts[parts.length - 1] === "uk") {
    idx = parts.length - 3;
  }
  const label = parts[idx] ?? parts[0]!;
  return titleCaseBrand(label);
}

/**
 * Human-readable prospect company for metadata — **no vendor API** for the label.
 * Prefer a label from the **attendee email domain** when present; else meeting title parse.
 */
export function resolveProspectDisplayName(params: {
  titleParsedName: string | null;
  emailDomain: string | null;
}): string | null {
  if (params.emailDomain?.trim()) {
    return displayNameFromEmailDomain(params.emailDomain.trim());
  }
  const title = params.titleParsedName?.trim();
  if (title) return title;
  return null;
}
