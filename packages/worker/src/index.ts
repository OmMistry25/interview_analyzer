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

  while (true) {
    const job = await claimJob(db);

    if (!job) {
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
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
