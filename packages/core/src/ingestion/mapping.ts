import { FathomMeeting } from "./fathomPayload";
import { normalizeText } from "./normalize";
import { NormalizedCall, NormalizedParticipant, NormalizedUtterance, MeetingContext } from "../types/normalized";

function parseTimestampToSec(ts: string): number | null {
  // "HH:MM:SS" → total seconds
  const parts = ts.split(":").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function isKnownAE(name: string): boolean {
  const lower = name.toLowerCase();
  return KNOWN_AES.some((ae) => lower.includes(ae.toLowerCase()));
}

export function mapFathomToNormalized(meeting: FathomMeeting): NormalizedCall {
  const participants: NormalizedParticipant[] = (meeting.calendar_invitees ?? []).map((inv) => {
    const name = inv.name ?? "Unknown";
    const role = isKnownAE(name) ? "ae" as const : inv.is_external ? "prospect" as const : "ae" as const;
    return { name, email: inv.email ?? null, role, sourceLabel: inv.matched_speaker_display_name ?? null };
  });

  // Add recorded_by as a participant if not already in invitees
  const recorderEmail = meeting.recorded_by?.email;
  const alreadyIncluded = participants.some((p) => p.email === recorderEmail);
  if (meeting.recorded_by && !alreadyIncluded) {
    participants.push({
      name: meeting.recorded_by.name,
      email: meeting.recorded_by.email,
      role: "ae",
      sourceLabel: meeting.recorded_by.team ?? null,
    });
  }

  const utterances: NormalizedUtterance[] = (meeting.transcript ?? []).map((entry, idx) => ({
    idx,
    speakerLabelRaw: entry.speaker.display_name,
    timestampStartSec: parseTimestampToSec(entry.timestamp),
    timestampEndSec: null, // Fathom only provides a single timestamp per entry
    textRaw: entry.text,
    textNormalized: normalizeText(entry.text),
  }));

  return {
    sourceMeetingId: null,
    sourceRecordingId: String(meeting.recording_id),
    title: meeting.title,
    startTime: meeting.recording_start_time ?? null,
    endTime: meeting.recording_end_time ?? null,
    shareUrl: meeting.share_url ?? null,
    fathomUrl: meeting.url ?? null,
    participants,
    utterances,
  };
}

const OUR_COMPANY = "Console";

export const KNOWN_AES = ["Sam Vila", "Eric Bower", "Christian", "Michael"];

/**
 * Extract the prospect company name from meeting titles like:
 *   "Console/Lattice (Legal)" → "Lattice"
 *   "Console // Goat HR focused demo" → "Goat HR"
 *   "(Clio/Console) - Connection Call" → "Clio"
 */
export function parseMeetingTitle(title: string): string | null {
  // Remove parenthesized wrapper like "(Clio/Console)"
  const unwrapped = title.replace(/^\(([^)]+)\)/, "$1");

  // Split on " // " or " / " or "/" or " x " or " <> "
  const parts = unwrapped.split(/\s*\/\/\s*|\s*\/\s*|\s+x\s+|\s*<>\s*/);
  if (parts.length < 2) return null;

  // Find the part that is NOT our company
  for (const raw of parts) {
    const cleaned = raw.trim();
    if (cleaned.toLowerCase() === OUR_COMPANY.toLowerCase()) continue;

    // Check for "Name (Company)" vs "Company (Descriptor)" pattern
    const parenMatch = cleaned.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (parenMatch) {
      const before = parenMatch[1].trim();
      const inner = parenMatch[2].trim();
      const isDescriptor = /^(legal|sales|hr|demo|intro|meeting|call|sync|ops|engineering|finance|marketing|security|it|product|design|support)$/i.test(inner);
      if (isDescriptor) {
        return before;
      }
      if (inner.toLowerCase() !== OUR_COMPANY.toLowerCase() && inner.length > 0) {
        return inner;
      }
    }

    // Fallback: strip trailing descriptors
    const companyName = cleaned
      .replace(/\s*[-–—].*$/, "")
      .replace(/\s+(focused|intro|demo|sync|meeting|call|kickoff|weekly|standup|biweekly|monthly|catchup|check-in).*$/i, "")
      .replace(/\s*\(.*\)$/, "")
      .trim();
    if (companyName.length > 0) return companyName;
  }

  return null;
}

export function buildMeetingContext(call: NormalizedCall): MeetingContext {
  const internalAttendees = call.participants
    .filter((p) => p.role === "ae")
    .map((p) => ({ name: p.name, email: p.email }));

  const knownAE = internalAttendees.find((a) => isKnownAE(a.name));

  return {
    meetingTitle: call.title,
    ourCompany: OUR_COMPANY,
    prospectCompany: parseMeetingTitle(call.title),
    aeName: knownAE?.name ?? internalAttendees[0]?.name ?? null,
    dealSegment: "mid_tier",
    internalAttendees,
    externalAttendees: call.participants
      .filter((p) => p.role === "prospect")
      .map((p) => ({ name: p.name, email: p.email })),
  };
}
