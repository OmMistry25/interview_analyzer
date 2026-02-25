import { FathomMeeting } from "./fathomPayload";
import { normalizeText } from "./normalize";
import { NormalizedCall, NormalizedParticipant, NormalizedUtterance } from "../types/normalized";

function parseTimestampToSec(ts: string): number | null {
  // "HH:MM:SS" → total seconds
  const parts = ts.split(":").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function mapFathomToNormalized(meeting: FathomMeeting): NormalizedCall {
  const participants: NormalizedParticipant[] = (meeting.calendar_invitees ?? []).map((inv) => ({
    name: inv.name ?? "Unknown",
    email: inv.email ?? null,
    role: inv.is_external ? "prospect" as const : "ae" as const,
    sourceLabel: inv.matched_speaker_display_name ?? null,
  }));

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
