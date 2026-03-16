import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

import { getServiceClient } from "@transcript-evaluator/core/src/storage/db";
import { claimJob, markJobSucceeded, markJobFailed } from "./locks";
import { processJob } from "./processor";

const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 3;

async function main() {
  console.log("Worker starting (poll mode)...");
  const db = getServiceClient();

  let consecutiveErrors = 0;

  while (true) {
    try {
      const job = await claimJob(db);

      if (!job) {
        consecutiveErrors = 0;
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log(`Claimed job ${job.id} [${job.type}]`);

      try {
        await processJob(db, job);
        await markJobSucceeded(db, job.id);
        console.log(`Job ${job.id} succeeded.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Job ${job.id} failed: ${message}`);
        await markJobFailed(db, job.id, MAX_ATTEMPTS);
      }

      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      const message = err instanceof Error ? err.message : String(err);
      const backoff = Math.min(POLL_INTERVAL_MS * consecutiveErrors, 60_000);
      console.warn(`Poll error (${consecutiveErrors}): ${message.slice(0, 200)} — retrying in ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
