// Matches the Fathom API Meeting schema
// https://developers.fathom.ai/api-reference/meetings/list-meetings

export interface FathomTranscriptSpeaker {
  display_name: string;
  matched_calendar_invitee_email?: string | null;
}

export interface FathomTranscriptItem {
  speaker: FathomTranscriptSpeaker;
  text: string;
  timestamp: string; // "HH:MM:SS" relative to recording start
}

export interface FathomInvitee {
  name: string | null;
  email: string | null;
  email_domain?: string | null;
  is_external: boolean;
  matched_speaker_display_name?: string | null;
}

export interface FathomUser {
  name: string;
  email: string;
  email_domain?: string;
  team: string | null;
}

export interface FathomMeetingSummary {
  template_name: string | null;
  markdown_formatted: string | null;
}

export interface FathomActionItem {
  description: string;
  user_generated: boolean;
  completed: boolean;
  recording_timestamp: string;
  recording_playback_url: string;
  assignee: {
    name: string | null;
    email: string | null;
    team: string | null;
  };
}

export interface FathomMeeting {
  title: string;
  meeting_title?: string | null;
  recording_id: number;
  url: string;
  share_url: string;
  created_at: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  recording_start_time: string;
  recording_end_time: string;
  calendar_invitees_domains_type?: string;
  transcript_language?: string;
  calendar_invitees: FathomInvitee[];
  recorded_by: FathomUser;
  transcript?: FathomTranscriptItem[] | null;
  default_summary?: FathomMeetingSummary | null;
  action_items?: FathomActionItem[] | null;
  crm_matches?: unknown;
}

export function isFathomMeeting(body: unknown): body is FathomMeeting {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.title === "string" &&
    typeof obj.recording_id === "number" &&
    typeof obj.url === "string" &&
    typeof obj.share_url === "string"
  );
}
