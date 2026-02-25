import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

import { getServiceClient } from "@transcript-evaluator/core/src/storage/db";
import { enqueueJob } from "@transcript-evaluator/core/src/storage/repositories";

async function main() {
  const db = getServiceClient();

  // Get all webhook events from our API import
  const { data: events, error } = await db
    .from("fathom_webhook_events")
    .select("id, webhook_id")
    .like("webhook_id", "api_import_%")
    .order("received_at", { ascending: true });

  if (error) throw error;
  if (!events || events.length === 0) {
    console.log("No API-imported events found.");
    return;
  }

  console.log(`Found ${events.length} events to requeue.\n`);

  for (const event of events) {
    const job = await enqueueJob(db, {
      type: "PROCESS_FATHOM_MEETING",
      payload: { webhook_event_id: event.id },
    });
    console.log(`Queued job ${job.id} for event ${event.webhook_id}`);
  }

  console.log("\nDone. Run the worker to process.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
