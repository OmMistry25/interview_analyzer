import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upsertWebhookEvent, enqueueJob } from "@transcript-evaluator/core/src/storage/repositories";

const FATHOM_API_URL = "https://api.fathom.ai/external/v1";
const MAX_PAGES = 30;

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function findMeetingByUrl(
  apiKey: string,
  targetUrl: string
): Promise<Record<string, unknown> | null> {
  const trimmed = targetUrl.trim().replace(/\/$/, "");
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ include_transcript: "true" });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${FATHOM_API_URL}/meetings?${params}`, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!res.ok) throw new Error(`Fathom API error: ${res.status}`);

    const data = await res.json();
    const meetings = (data.items ?? []) as Record<string, unknown>[];

    const match = meetings.find((m) => {
      const url = (m.url as string)?.replace(/\/$/, "");
      const shareUrl = (m.share_url as string)?.replace(/\/$/, "");
      return url === trimmed || shareUrl === trimmed;
    });

    if (match) return match;

    cursor = data.next_cursor;
    if (!cursor) break;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const meetingUrl = body.url as string;

  if (!meetingUrl || typeof meetingUrl !== "string") {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FATHOM_API_KEY not configured" }, { status: 500 });
  }

  try {
    const match = await findMeetingByUrl(apiKey, meetingUrl);

    if (!match) {
      return NextResponse.json(
        { error: "Meeting not found in your Fathom account. Check the link and try again." },
        { status: 404 }
      );
    }

    const recId = String(match.recording_id);
    const webhookId = `manual_import_${recId}`;

    const db = getServiceClient();

    const event = await upsertWebhookEvent(db, {
      webhookId,
      verified: true,
      rawHeaders: { source: "manual_import" },
      rawBody: match,
    });

    await enqueueJob(db, {
      type: "PROCESS_FATHOM_MEETING",
      payload: { webhook_event_id: event.id },
    });

    return NextResponse.json({
      ok: true,
      title: match.title,
      event_id: event.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
