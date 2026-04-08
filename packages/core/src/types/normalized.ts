export interface NormalizedUtterance {
  idx: number;
  speakerLabelRaw: string;
  timestampStartSec: number | null;
  timestampEndSec: number | null;
  textRaw: string;
  textNormalized: string;
}

export interface NormalizedParticipant {
  name: string;
  email: string | null;
  role: "ae" | "prospect" | "unknown";
  sourceLabel: string | null;
}

export interface NormalizedCall {
  sourceMeetingId: string | null;
  sourceRecordingId: string | null;
  title: string;
  startTime: string | null;
  endTime: string | null;
  shareUrl: string | null;
  fathomUrl: string | null;
  participants: NormalizedParticipant[];
  utterances: NormalizedUtterance[];
}

export interface MeetingContext {
  meetingTitle: string;
  ourCompany: string;
  /** Resolved display name: Apollo org name > title parse > domain label (set after enrichment in worker). */
  prospectCompany: string | null;
  /** External attendee email domain(s) consensus, e.g. acme.com — used for Apollo enrich. */
  prospectEmailDomain: string | null;
  aeName: string | null;
  dealSegment: "enterprise" | "mid_tier";
  internalAttendees: { name: string; email: string | null }[];
  externalAttendees: { name: string; email: string | null }[];
}
