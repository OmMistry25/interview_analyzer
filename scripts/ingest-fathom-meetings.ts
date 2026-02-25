import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

import { getServiceClient } from "@transcript-evaluator/core/src/storage/db";
import { upsertWebhookEvent, enqueueJob } from "@transcript-evaluator/core/src/storage/repositories";

const FATHOM_API_URL = "https://api.fathom.ai/external/v1";

async function fetchMeetings(): Promise<unknown[]> {
  const res = await fetch(`${FATHOM_API_URL}/meetings?include_transcript=true`, {
    headers: { "X-Api-Key": process.env.FATHOM_API_KEY! },
  });

  if (!res.ok) throw new Error(`Fathom API error: ${res.status} ${await res.text()}`);

  const data = await res.json();
  return data.items ?? [];
}

async function main() {
  const meetings = await fetchMeetings();
  console.log(`Fetched ${meetings.length} meetings from Fathom API\n`);

  const db = getServiceClient();

  for (const meeting of meetings) {
    const m = meeting as Record<string, unknown>;
    const recId = String(m.recording_id);
    const webhookId = `api_import_${recId}`;

    console.log(`Ingesting: ${m.title} (recording_id: ${recId})`);

    const event = await upsertWebhookEvent(db, {
      webhookId,
      verified: true,
      rawHeaders: { source: "api_import" },
      rawBody: meeting,
    });

    await enqueueJob(db, {
      type: "PROCESS_FATHOM_MEETING",
      payload: { webhook_event_id: event.id },
    });

    console.log(`  -> Event ${event.id} queued\n`);
  }

  console.log("Done. Run the worker to process all jobs.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
