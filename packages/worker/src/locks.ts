import { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;

export async function claimJob(db: SupabaseClient): Promise<{ id: string; type: string; payload: Record<string, unknown> } | null> {
  // Atomically claim the oldest eligible job using RPC or a two-step select+update.
  // Supabase JS doesn't support SELECT ... FOR UPDATE SKIP LOCKED,
  // so we use an update with filters and limit via a match on status + run_after.
  const now = new Date().toISOString();

  const { data: candidates, error: selectErr } = await db
    .from("jobs")
    .select("id")
    .eq("status", "queued")
    .lte("run_after", now)
    .order("created_at", { ascending: true })
    .limit(1);

  if (selectErr) throw selectErr;
  if (!candidates || candidates.length === 0) return null;

  const jobId = candidates[0].id;

  const { data, error: updateErr } = await db
    .from("jobs")
    .update({
      status: "running",
      locked_at: now,
      locked_by: WORKER_ID,
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, type, payload")
    .single();

  if (updateErr || !data) {
    // Another worker grabbed it — return null
    return null;
  }

  return data as { id: string; type: string; payload: Record<string, unknown> };
}

export async function markJobSucceeded(db: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await db
    .from("jobs")
    .update({
      status: "succeeded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw error;
}

export async function markJobFailed(
  db: SupabaseClient,
  jobId: string,
  maxAttempts: number
): Promise<void> {
  // Fetch current attempts
  const { data, error: fetchErr } = await db
    .from("jobs")
    .select("attempts")
    .eq("id", jobId)
    .single();

  if (fetchErr || !data) throw fetchErr;

  const newAttempts = data.attempts + 1;
  const isDead = newAttempts >= maxAttempts;

  const backoffSec = Math.min(60 * Math.pow(2, newAttempts), 3600);
  const runAfter = new Date(Date.now() + backoffSec * 1000).toISOString();

  const { error } = await db
    .from("jobs")
    .update({
      status: isDead ? "dead" : "queued",
      attempts: newAttempts,
      run_after: isDead ? undefined : runAfter,
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw error;
}
