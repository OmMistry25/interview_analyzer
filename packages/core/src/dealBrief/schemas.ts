import { z } from "zod";

const evidence = z.array(z.string());

/** Second-pass AE-style deal narrative grounded in transcript + cross-checked with structured signals. */
export const dealBriefSchema = z.object({
  contacts: z.array(
    z.object({
      name: z.string(),
      role_summary: z.string(),
      evidence: evidence,
    })
  ),
  stack: z.object({
    summary: z.string(),
    tools: z.array(z.string()),
    evidence: evidence,
  }),
  catalyst_why_now: z.object({
    summary: z.string(),
    evidence: evidence,
  }),
  scope_and_intake: z.object({
    summary: z.string(),
    evidence: evidence,
  }),
  pain_points: z.array(
    z.object({
      summary: z.string(),
      evidence: evidence,
    })
  ),
  what_they_want_next: z.array(z.string()),
  parallel_tracks: z.array(z.string()),
  discovery: z.object({
    summary: z.string(),
    evidence: evidence,
  }),
  next_steps: z.object({
    summary: z.string(),
    evidence: evidence,
  }),
});

export type DealBrief = z.infer<typeof dealBriefSchema>;
