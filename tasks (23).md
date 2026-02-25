# MVP Build Plan (Granular, Small, Testable Tasks)

Assumptions:
- Repo is a monorepo per `architecture.md`: `apps/web`, `packages/core`, `packages/worker`, `supabase/`.
- Next.js App Router.
- Supabase project already created (URL + keys available).
- Fathom webhook secret available (or stubbed for local tests).

Conventions:
- Every task has: **Goal**, **Start**, **End**, **Test**.
- Keep tasks single-purpose; no “and then” steps.
- Prefer “make it work locally” before deploying.

---

## Phase 0: Repo + Tooling Baseline

### Task 0.1 — Initialize monorepo workspace
- **Goal:** Create workspace with `apps/` and `packages/` layout.
- **Start:** Empty repo.
- **End:** Directories exist and root `package.json` defines workspaces.
- **Test:** `npm install` completes without errors.

### Task 0.2 — Add TypeScript config baseline
- **Goal:** Shared TS config for packages.
- **Start:** Repo has workspaces.
- **End:** Root `tsconfig.base.json` created; packages reference it.
- **Test:** `npx tsc -p packages/core` runs (even if empty) without config errors.

### Task 0.3 — Create Next.js app scaffold
- **Goal:** `apps/web` builds and runs.
- **Start:** Workspace exists.
- **End:** Next.js app created with App Router.
- **Test:** `npm run dev` starts and serves a page.

### Task 0.4 — Create core package scaffold
- **Goal:** `packages/core` compiles.
- **Start:** Workspace exists.
- **End:** `packages/core/package.json` and `src/index.ts` exist.
- **Test:** `npx tsc -p packages/core` succeeds.

### Task 0.5 — Create worker package scaffold
- **Goal:** `packages/worker` compiles.
- **Start:** Workspace exists.
- **End:** `packages/worker/package.json` and `src/runOnce.ts` exist.
- **Test:** `npx tsc -p packages/worker` succeeds.

### Task 0.6 — Add env example + env loader
- **Goal:** Standard env variables documented and loaded.
- **Start:** Packages exist.
- **End:** `.env.example` added; worker loads env via `dotenv`.
- **Test:** Running worker prints “env loaded” and exits 0.

---

## Phase 1: Supabase Schema + Local Validation

### Task 1.1 — Create initial migration file
- **Goal:** Add first SQL migration under `supabase/migrations`.
- **Start:** `supabase/` folder exists.
- **End:** Migration file created (timestamped) with placeholder.
- **Test:** File exists and is referenced by Supabase CLI (if used).

### Task 1.2 — Create table: `fathom_webhook_events`
- **Goal:** Persist webhook events for idempotency/audit.
- **Start:** Migration placeholder exists.
- **End:** Table created with columns and unique `webhook_id`.
- **Test:** Insert two rows with same `webhook_id` fails due to unique constraint.

### Task 1.3 — Create table: `calls`
- **Goal:** Store call metadata.
- **Start:** Prior migration updated.
- **End:** `calls` table created.
- **Test:** Insert minimal row succeeds.

### Task 1.4 — Create table: `participants`
- **Goal:** Store participants per call.
- **Start:** `calls` exists.
- **End:** `participants` table created with FK to `calls`.
- **Test:** Insert participant with invalid call_id fails; valid succeeds.

### Task 1.5 — Create table: `utterances`
- **Goal:** Store canonical transcript utterances.
- **Start:** `calls` + `participants` exist.
- **End:** `utterances` table created with FK to `calls` and optional FK to `participants`.
- **Test:** Insert utterances; query ordered by `(call_id, idx)` returns correct order.

### Task 1.6 — Create table: `jobs`
- **Goal:** DB-backed queue.
- **Start:** `calls` exists.
- **End:** `jobs` table created with status, attempts, run_after, payload.
- **Test:** Insert a queued job and select it by `status='queued'`.

### Task 1.7 — Create table: `processing_runs`
- **Goal:** Track pipeline runs and versions.
- **Start:** `calls` exists.
- **End:** `processing_runs` table created.
- **Test:** Insert run row linked to call.

### Task 1.8 — Create table: `extracted_signals`
- **Goal:** Store extracted signals JSON.
- **Start:** `processing_runs` exists.
- **End:** `extracted_signals` table created.
- **Test:** Insert JSON and query it back.

### Task 1.9 — Create table: `evaluations`
- **Goal:** Store evaluation outputs and summary fields.
- **Start:** `processing_runs` exists.
- **End:** `evaluations` table created.
- **Test:** Insert evaluation row with status + score.

### Task 1.10 — Add minimal RLS policies (read-only to authed)
- **Goal:** Prevent public access; allow authenticated reads (MVP).
- **Start:** Tables exist.
- **End:** RLS enabled and policies created for `select` for authenticated users.
- **Test:** Unauthed select fails; authed select succeeds.

---

## Phase 2: Supabase Client Utilities (Server + Worker)

### Task 2.1 — Add Supabase server client helper (apps/web)
- **Goal:** Create `apps/web/lib/supabase/server.ts`.
- **Start:** Next.js app exists.
- **End:** Server client created using env vars and cookies if needed.
- **Test:** A server route can call `supabase.auth.getUser()` without runtime error.

### Task 2.2 — Add Supabase browser client helper (apps/web)
- **Goal:** Create `apps/web/lib/supabase/client.ts`.
- **Start:** Next.js app exists.
- **End:** Browser client helper created.
- **Test:** Client can initialize without throwing.

### Task 2.3 — Add Supabase service-role client for worker (packages/core)
- **Goal:** Worker can access DB without RLS issues.
- **Start:** `packages/core` exists.
- **End:** `packages/core/src/storage/db.ts` exports a service-role supabase client.
- **Test:** Worker can select from `jobs` table locally (with correct env).

---

## Phase 3: Webhook Endpoint (Ingestion Only)

### Task 3.1 — Create webhook route file
- **Goal:** Add `apps/web/app/api/webhooks/fathom/route.ts`.
- **Start:** Next.js app exists.
- **End:** Route returns 200 on POST with dummy body.
- **Test:** `curl -X POST` returns 200.

### Task 3.2 — Implement raw body reading in route
- **Goal:** Ensure signature verification uses raw body bytes/string.
- **Start:** Route exists.
- **End:** Route reads raw text body without JSON parsing first.
- **Test:** Log raw body length; it matches input.

### Task 3.3 — Implement webhook signature verification function
- **Goal:** Add `packages/core/src/ingestion/verifyWebhook.ts`.
- **Start:** Core package exists.
- **End:** Function verifies using `webhook-id`, `webhook-timestamp`, `webhook-signature`, `whsec_...`.
- **Test:** Unit test: known sample produces `true`; tampered body produces `false`.

### Task 3.4 — Wire verification into webhook route
- **Goal:** Reject invalid signatures.
- **Start:** Verification function exists.
- **End:** Route returns 401 on invalid signature; 200 on valid.
- **Test:** Send request missing headers → 401; valid fixture → 200.

### Task 3.5 — Store webhook event (idempotent upsert)
- **Goal:** Persist event with unique webhook_id.
- **Start:** Supabase tables exist.
- **End:** Route upserts `fathom_webhook_events` by `webhook_id`.
- **Test:** Send same webhook twice; table has 1 row.

### Task 3.6 — Enqueue job on verified webhook
- **Goal:** Create a `jobs` row for processing.
- **Start:** Event insert works.
- **End:** Route inserts `jobs` row with type `PROCESS_FATHOM_MEETING`, payload includes webhook_event_id.
- **Test:** After POST, DB shows one queued job linked to the event.

### Task 3.7 — Do not enqueue job on unverified webhook
- **Goal:** Security guarantee.
- **Start:** Enqueue works for verified.
- **End:** Invalid signature returns 401 and no job row created.
- **Test:** Confirm jobs count unchanged after invalid request.

---

## Phase 4: Worker Basics (Locking + Run Loop)

### Task 4.1 — Implement job claim (row locking pattern)
- **Goal:** Safely claim one job at a time.
- **Start:** `jobs` table exists.
- **End:** `packages/worker/src/locks.ts` claims a job by updating `locked_at/locked_by/status=running` atomically.
- **Test:** Two concurrent worker runs claim different jobs (or one claims, other finds none).

### Task 4.2 — Implement worker runOnce loop
- **Goal:** Process N jobs then exit.
- **Start:** Claim works.
- **End:** `runOnce.ts` claims up to `N` jobs and calls `processor`.
- **Test:** With 1 queued job, worker processes it and exits 0.

### Task 4.3 — Implement job status transitions
- **Goal:** Standardize `queued → running → succeeded/failed`.
- **Start:** Worker loop exists.
- **End:** Helper functions update job status and attempts.
- **Test:** Force an error; job becomes `failed` and `attempts` increments.

### Task 4.4 — Implement retry/backoff
- **Goal:** Failed jobs reschedule until max attempts.
- **Start:** Status transitions exist.
- **End:** On failure, set `status=queued` and `run_after=now + backoff` if attempts < max; else `dead`.
- **Test:** Simulate repeated failures until job becomes `dead`.

---

## Phase 5: Transcript Normalization + Storage

### Task 5.1 — Define normalized transcript types
- **Goal:** Canonical types for transcript and utterances.
- **Start:** Core package exists.
- **End:** `packages/core/src/types/normalized.ts` defines interfaces.
- **Test:** Typecheck passes.

### Task 5.2 — Create Fathom payload types (minimal)
- **Goal:** Typed access to webhook JSON.
- **Start:** Core package exists.
- **End:** `packages/core/src/ingestion/fathomPayload.ts` added.
- **Test:** Worker can parse JSON with type guards or runtime checks.

### Task 5.3 — Implement transcript mapping (payload → utterances array)
- **Goal:** Convert webhook transcript entries to canonical utterances.
- **Start:** Payload types exist.
- **End:** `packages/core/src/ingestion/mapping.ts` returns utterances with idx, speaker label, timestamps, raw text.
- **Test:** Fixture input produces expected utterance count and ordering.

### Task 5.4 — Implement deterministic normalization function
- **Goal:** Produce `text_normalized` without changing meaning.
- **Start:** Mapping exists.
- **End:** `packages/core/src/ingestion/normalize.ts` trims whitespace, collapses spaces, preserves numbers.
- **Test:** Given input with extra spaces/newlines, normalized output matches expectation.

### Task 5.5 — Persist call row from webhook payload
- **Goal:** Create or update `calls` record.
- **Start:** Worker can read webhook event.
- **End:** Worker upserts `calls` using source_recording_id or share_url as a stable key.
- **Test:** Processing same event twice results in one call row.

### Task 5.6 — Persist participants
- **Goal:** Store participant rows.
- **Start:** Calls upsert works.
- **End:** Worker inserts participants from payload (if present) or creates an `unknown` participant.
- **Test:** Query participants for call returns expected rows.

### Task 5.7 — Persist utterances
- **Goal:** Store utterances rows for call.
- **Start:** Mapping + normalization exist.
- **End:** Worker inserts utterances and sets `(call_id, idx)` ordering; replaces existing utterances on reprocess.
- **Test:** Reprocessing deletes/replaces utterances and count matches expected.

### Task 5.8 — Compute transcript hash
- **Goal:** Stable hash for reproducibility.
- **Start:** Utterances exist.
- **End:** Hash computed from ordered `(speaker_label_raw + timestamp_start + text_raw)` and stored on processing_run.
- **Test:** Same transcript yields same hash; modified text changes hash.

---

## Phase 6: Processing Run Tracking

### Task 6.1 — Create processing run row at start
- **Goal:** Every pipeline execution has a run record.
- **Start:** Worker processes call.
- **End:** Insert `processing_runs` row with versions + status=running.
- **Test:** Run row created before any LLM call.

### Task 6.2 — Mark processing run success/failure
- **Goal:** Accurate run statuses.
- **Start:** Run row created.
- **End:** On success mark succeeded with finished_at; on error mark failed with error message.
- **Test:** Simulate failure and confirm status=failed with error.

---

## Phase 7: LLM Signal Extractor (Strict JSON)

### Task 7.1 — Add extractor prompt file
- **Goal:** Store prompt text in repo, versioned.
- **Start:** Core package exists.
- **End:** `packages/core/src/prompts/extractor_v1.txt` added.
- **Test:** Worker can read it as a string.

### Task 7.2 — Define extracted signals schema validator
- **Goal:** Validate extractor JSON strictly.
- **Start:** Prompt file exists.
- **End:** `packages/core/src/extraction/schemas.ts` defines zod (or JSON schema) validator.
- **Test:** Valid fixture passes; missing required fields fails.

### Task 7.3 — Implement extractor API wrapper
- **Goal:** Single function to call LLM and parse JSON.
- **Start:** Schema validator exists.
- **End:** `packages/core/src/extraction/extractor.ts` sends transcript to LLM and returns validated JSON.
- **Test:** With mocked LLM response, parsing succeeds and returns typed object.

### Task 7.4 — Store extracted signals
- **Goal:** Persist extractor output.
- **Start:** Extractor returns JSON.
- **End:** Insert row into `extracted_signals` with `processing_run_id`.
- **Test:** DB row exists and `signals_json` matches response.

### Task 7.5 — Enforce evidence requirement
- **Goal:** Any non-unknown value must include at least one evidence quote.
- **Start:** Schema exists.
- **End:** Add validation rule (custom zod refine) to fail if evidence missing.
- **Test:** Fixture with value present but no evidence fails validation.

---

## Phase 8: LLM Evaluator (Strict Rubric Application)

### Task 8.1 — Add evaluator prompt file
- **Goal:** Versioned evaluator prompt.
- **Start:** Core package exists.
- **End:** `packages/core/src/prompts/evaluator_v1.txt` added.
- **Test:** Worker reads prompt.

### Task 8.2 — Define evaluation schema validator
- **Goal:** Validate evaluator output JSON.
- **Start:** Prompt exists.
- **End:** `packages/core/src/evaluation/schemas.ts` validates output shape.
- **Test:** Valid fixture passes; missing fields fails.

### Task 8.3 — Implement evaluator API wrapper
- **Goal:** Call LLM with extracted signals and rubric.
- **Start:** Schema exists.
- **End:** `packages/core/src/evaluation/evaluator.ts` returns validated evaluation JSON.
- **Test:** Mocked response parses; score is integer; status in allowed set.

### Task 8.4 — Store evaluation output
- **Goal:** Persist evaluation summary + raw JSON.
- **Start:** Evaluator returns JSON.
- **End:** Insert into `evaluations` with `overall_status` and `score`.
- **Test:** DB row exists and summary fields match JSON.

### Task 8.5 — Verify evidence_refs are valid paths
- **Goal:** Prevent unsupported flags.
- **Start:** Evaluation stored.
- **End:** Add validator that each `evidence_refs` path resolves to an evidence object in extracted signals.
- **Test:** Invalid evidence path fails validation.

---

## Phase 9: Deterministic Rules Engine Cross-check

### Task 9.1 — Implement rules engine for hard DQ checks
- **Goal:** Deterministically re-check hard disqualifiers from extracted signals.
- **Start:** Extracted signals stored.
- **End:** `packages/core/src/evaluation/rulesEngine.ts` returns list of triggered hard DQs.
- **Test:** Fixture triggers expected hard DQ ID.

### Task 9.2 — Add mismatch handling
- **Goal:** Catch evaluator drift.
- **Start:** Rules engine exists.
- **End:** If evaluator says Qualified/Yellow but rules trigger hard DQ, set overall to Needs Review and log mismatch.
- **Test:** Synthetic mismatch results in Needs Review.

---

## Phase 10: Frontend MVP UI (Read-only)

### Task 10.1 — Add auth-protected layout
- **Goal:** Require login for dashboard routes.
- **Start:** Supabase auth configured.
- **End:** Middleware redirects unauthenticated users to login.
- **Test:** Visiting `/dashboard` unauthenticated redirects.

### Task 10.2 — Build calls list page skeleton
- **Goal:** Show list of calls.
- **Start:** Auth works.
- **End:** `/dashboard/calls` page queries `calls` and renders rows.
- **Test:** Seed DB with one call; page shows it.

### Task 10.3 — Add evaluation summary to calls list
- **Goal:** Show status and score.
- **Start:** Calls list renders.
- **End:** Join latest evaluation per call and display `overall_status` and `score`.
- **Test:** With evaluation row present, UI shows correct status/score.

### Task 10.4 — Build call detail page skeleton
- **Goal:** Detail view by call id.
- **Start:** Calls list exists.
- **End:** `/dashboard/calls/[id]` loads call, latest evaluation, extracted signals.
- **Test:** Visiting call detail renders without error.

### Task 10.5 — Render flags with evidence quotes
- **Goal:** Show flags and their evidence.
- **Start:** Detail page loads evaluation.
- **End:** UI renders hard/red/yellow flags; each shows quotes from referenced evidence paths.
- **Test:** Click a flag and see the quoted evidence.

### Task 10.6 — Render “Missing info” list
- **Goal:** Show missing critical fields from extracted signals `quality_checks`.
- **Start:** Extracted signals loaded.
- **End:** UI displays `missing_critical_info` and `ambiguities`.
- **Test:** When populated, list shows items.

---

## Phase 11: Reprocess Tooling (Admin-only MVP)

### Task 11.1 — Add admin-only reprocess endpoint
- **Goal:** Trigger reprocess by call id.
- **Start:** Auth exists.
- **End:** `POST /api/admin/reprocess` creates `REPROCESS_CALL` job.
- **Test:** Calling endpoint creates queued job.

### Task 11.2 — Add “Reprocess” button in UI
- **Goal:** UI can enqueue reprocess.
- **Start:** Admin endpoint exists.
- **End:** Button appears for admin users and calls endpoint.
- **Test:** Clicking button creates a job.

---

## Phase 12: End-to-End Acceptance Tests

### Task 12.1 — Add webhook fixture test (local)
- **Goal:** Simulate end-to-end processing.
- **Start:** Webhook route + worker exist.
- **End:** Script posts a webhook fixture, worker processes it, DB has call + utterances + signals + evaluation.
- **Test:** Script exits 0 and prints IDs.

### Task 12.2 — Add idempotency test
- **Goal:** Confirm duplicate webhook does not duplicate call/jobs.
- **Start:** Fixture test exists.
- **End:** Post same webhook twice; confirm single call and single succeeded job (or second job ignored).
- **Test:** Counts match expectation.

### Task 12.3 — Add failure/retry test
- **Goal:** Ensure retries work.
- **Start:** Worker retry/backoff exists.
- **End:** Force extractor error; job retries; after max attempts job is dead and run marked failed.
- **Test:** DB shows attempts increment and final status dead.

---

## MVP Definition of Done

You can declare MVP complete when:

1. Posting a verified Fathom webhook results in:
   - a stored webhook event
   - one `calls` row
   - `utterances` populated
   - one `processing_runs` row
   - `extracted_signals` populated (schema-valid)
   - `evaluations` populated (schema-valid)

2. Frontend shows:
   - calls list with status + score
   - call detail with flags and evidence quotes

3. You can reprocess a call via UI or endpoint.

