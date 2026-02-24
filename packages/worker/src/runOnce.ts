import { getServiceClient } from "@transcript-evaluator/core/src/storage/db";
import { claimJob, markJobSucceeded, markJobFailed } from "./locks";
import { processJob } from "./processor";

const DEFAULT_MAX_ATTEMPTS = 3;

export async function runOnce(maxJobs = 1): Promise<number> {
  const db = getServiceClient();
  let processed = 0;

  for (let i = 0; i < maxJobs; i++) {
    const job = await claimJob(db);
    if (!job) {
      console.log("No more jobs to process.");
      break;
    }

    console.log(`Claimed job ${job.id} [${job.type}]`);

    try {
      await processJob(db, job);
      await markJobSucceeded(db, job.id);
      console.log(`Job ${job.id} succeeded.`);
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Job ${job.id} failed: ${message}`);
      await markJobFailed(db, job.id, DEFAULT_MAX_ATTEMPTS);
    }
  }

  return processed;
}
