import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { createClient } from "@supabase/supabase-js";
import { upsertWebhookEvent, enqueueJob } from "../storage/repositories";

const FATHOM_API_URL = "https://api.fathom.ai/external/v1";

interface FathomPage {
  items: Record<string, unknown>[];
  next_cursor: string | null;
}

async function fetchAllMeetings(apiKey: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let page = 1;

  // First page
  const res = await fetch(`${FATHOM_API_URL}/meetings?include_transcript=true`, {
    headers: { "X-Api-Key": apiKey },
  });
  if (!res.ok) throw new Error(`Fathom API error: ${res.status}`);
  const first: FathomPage = await res.json();
  all.push(...(first.items ?? []));
  cursor = first.next_cursor;
  console.log(`  Page ${page}: fetched ${first.items?.length ?? 0} meetings (total so far: ${all.length})`);

  while (cursor) {
    page++;
    const params = new URLSearchParams({ include_transcript: "true", cursor });
    const pageRes = await fetch(`${FATHOM_API_URL}/meetings?${params}`, {
      headers: { "X-Api-Key": apiKey },
    });
    if (!pageRes.ok) throw new Error(`Fathom API error: ${pageRes.status}`);
    const pageData: FathomPage = await pageRes.json();
    all.push(...(pageData.items ?? []));
    cursor = pageData.next_cursor;
    console.log(`  Page ${page}: fetched ${pageData.items?.length ?? 0} meetings (total so far: ${all.length})`);
  }

  return all;
}

async function main() {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) throw new Error("FATHOM_API_KEY not set");

  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log("Fetching all meetings from Fathom...");
  const meetings = await fetchAllMeetings(apiKey);
  console.log(`\nTotal meetings from Fathom: ${meetings.length}`);

  // Check which recording_ids already exist in our DB
  const { data: existingCalls } = await db
    .from("calls")
    .select("source_recording_id");

  const existingIds = new Set(
    (existingCalls ?? []).map((c) => String(c.source_recording_id))
  );
  console.log(`Already in DB: ${existingIds.size} calls`);

  const toImport = meetings.filter(
    (m) => !existingIds.has(String(m.recording_id))
  );
  console.log(`New meetings to import: ${toImport.length}\n`);

  if (toImport.length === 0) {
    console.log("Nothing to import. All Fathom meetings are already in the database.");
    return;
  }

  // Filter out meetings without transcripts
  const withTranscripts = toImport.filter((m) => {
    const transcript = m.transcript as unknown[] | null;
    return transcript && transcript.length > 0;
  });
  console.log(`With transcripts: ${withTranscripts.length} (skipping ${toImport.length - withTranscripts.length} without transcripts)\n`);

  let enqueued = 0;
  for (const meeting of withTranscripts) {
    const recordingId = String(meeting.recording_id);
    const webhookId = `bulk_import_${recordingId}`;

    try {
      const event = await upsertWebhookEvent(db, {
        webhookId,
        verified: true,
        rawHeaders: { source: "bulk_import" },
        rawBody: meeting,
      });

      await enqueueJob(db, {
        type: "PROCESS_FATHOM_MEETING",
        payload: { webhook_event_id: event.id },
      });

      enqueued++;
      if (enqueued % 10 === 0) {
        console.log(`  Enqueued ${enqueued}/${withTranscripts.length}: ${meeting.title}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Failed to enqueue ${meeting.title}: ${msg}`);
    }
  }

  console.log(`\nDone. Enqueued ${enqueued} meetings for processing.`);
  console.log("The worker will process them in the background (each takes ~10-15s for OpenAI calls).");
  console.log(`Estimated time: ~${Math.ceil((enqueued * 12) / 60)} minutes.`);
  console.log("\nAfter the worker finishes, re-run the GEO backfill from the dashboard to analyze new calls.");
}

main().catch((err) => {
  console.error("Bulk import failed:", err);
  process.exit(1);
});
