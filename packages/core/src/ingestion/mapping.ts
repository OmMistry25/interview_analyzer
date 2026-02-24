import { FathomMeetingData } from "./fathomPayload";
import { normalizeText } from "./normalize";
import { NormalizedCall, NormalizedParticipant, NormalizedUtterance } from "../types/normalized";

export function mapFathomToNormalized(data: FathomMeetingData): NormalizedCall {
  const participants: NormalizedParticipant[] = (data.attendees ?? []).map((a) => ({
    name: a.name,
    email: a.email ?? null,
    role: "unknown" as const,
    sourceLabel: a.label ?? null,
  }));

  const utterances: NormalizedUtterance[] = (data.transcript ?? []).map((entry, idx) => ({
    idx,
    speakerLabelRaw: entry.speaker,
    timestampStartSec: entry.start ?? null,
    timestampEndSec: entry.end ?? null,
    textRaw: entry.text,
    textNormalized: normalizeText(entry.text),
  }));

  return {
    sourceMeetingId: data.id ?? null,
    sourceRecordingId: data.recording_id ?? null,
    title: data.title ?? "Untitled Call",
    startTime: data.started_at ?? null,
    endTime: data.ended_at ?? null,
    shareUrl: data.share_url ?? null,
    fathomUrl: data.fathom_url ?? null,
    participants,
    utterances,
  };
}
