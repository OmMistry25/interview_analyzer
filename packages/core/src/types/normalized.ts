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
  prospectCompany: string | null;
  aeName: string | null;
  internalAttendees: { name: string; email: string | null }[];
  externalAttendees: { name: string; email: string | null }[];
}
