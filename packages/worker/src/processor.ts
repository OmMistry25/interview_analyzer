import { SupabaseClient } from "@supabase/supabase-js";

export async function processJob(
  db: SupabaseClient,
  job: { id: string; type: string; payload: Record<string, unknown> }
): Promise<void> {
  console.log(`Processing job ${job.id} [${job.type}]`);

  switch (job.type) {
    case "PROCESS_FATHOM_MEETING":
      // Will be implemented in Phase 5+
      console.log("  payload:", JSON.stringify(job.payload));
      break;

    case "REPROCESS_CALL":
      console.log("  reprocess payload:", JSON.stringify(job.payload));
      break;

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}
