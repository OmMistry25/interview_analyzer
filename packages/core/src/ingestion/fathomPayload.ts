export interface FathomWebhookPayload {
  event: string;
  data: FathomMeetingData;
}

export interface FathomMeetingData {
  id?: string;
  recording_id?: string;
  title?: string;
  started_at?: string;
  ended_at?: string;
  share_url?: string;
  fathom_url?: string;
  attendees?: FathomAttendee[];
  transcript?: FathomTranscriptEntry[];
}

export interface FathomAttendee {
  name: string;
  email?: string;
  label?: string;
}

export interface FathomTranscriptEntry {
  speaker: string;
  start?: number;
  end?: number;
  text: string;
}

export function isFathomPayload(body: unknown): body is FathomWebhookPayload {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.event === "string" && typeof obj.data === "object" && obj.data !== null;
}
