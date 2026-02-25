# Transcript Evaluation Tool Architecture (Next.js + Supabase)

## Goals

Build a production-grade system that:

- Ingests meeting transcripts from Fathom via webhook and/or API fallback.
- Normalizes transcripts into a canonical format for auditability.
- Extracts qualification signals deterministically (regex/lexicons) + via LLM.
- Evaluates calls against an S0 qualification rubric with deterministic scoring and evidence citations.
- Stores raw artifacts, extracted signals, evaluations, and processing traces.
- Provides a lightweight UI for AEs and ops to review outcomes, flags, and evidence.

Non-goals (v0):
- Real-time call coaching.
- Full CRM sync and enrichment (can add later).

---

## High-level System Overview

**Data flow**

1. **Fathom Webhook** → Next.js API route (`/api/webhooks/fathom`)
2. Verify signature + idempotency → store raw event → enqueue a job in Supabase (DB)
3. **Worker** (Supabase Scheduled Function or a separate Node worker) pulls jobs:
   - Normalize transcript
   - Run deterministic pre-extraction (optional but recommended)
   - LLM signal extraction (call #1)
   - LLM evaluation (call #2)
   - Optional rules-engine cross-check
4. Persist outputs + traces to Supabase (Postgres + Storage)
5. **Next.js Frontend** reads results (RLS-protected) for review, search, and debugging.

---

## Tech Stack

### Frontend
- **Next.js (App Router)** for UI + server actions where useful.
- Optional: Tailwind for styling.

### Backend
- **Next.js API Routes** for:
  - Webhook ingestion (must be fast and reliable)
  - Internal admin endpoints (optional)

### Data + Auth
- **Supabase Auth** (email/password or SSO).
- **Supabase Postgres** (primary state store).
- **Supabase Storage** (large raw artifacts, full transcripts, payload backups).

### Jobs/Queue
Choose one (start simple; upgrade later):
1. **Supabase DB-backed queue** (recommended to start):
   - Table `jobs` with statuses + retries.
   - Worker: Supabase Scheduled Function (cron) or external worker.
2. Later: dedicated queue (Cloud Tasks/Redis/Rabbit) if throughput grows.

### LLM Provider
- OpenAI API (or equivalent) for:
  - Signal extraction (strict JSON schema)
  - Evaluation (strict rubric application)

---

## Where State Lives

### Primary state: Supabase Postgres
- Webhook event receipt (idempotency)
- Call records
- Canonical normalized transcript (structured utterances)
- Extracted signals JSON
- Evaluation outputs JSON
- Processing run traces + versions (prompt/rubric versions)

### Large/raw artifacts: Supabase Storage
- Raw webhook payloads (optional; can store in DB if small)
- Original transcript blobs (if huge)
- Normalized transcript JSON snapshots (optional)
- Debug bundles (for audit/export)

### Frontend state
- UI state is **ephemeral** (React state):
  - filters, search query, sort, pagination state
  - selected call, expanded evidence sections
- Persistent user preferences (optional):
  - store in `user_settings` table

---

## Service Connectivity

### Fathom → Your system
- Fathom posts webhook to: `POST /api/webhooks/fathom`
- You verify signature + timestamp and store the raw event.
- You enqueue a job with a stable ID.

### Your worker → Supabase
- Worker pulls pending jobs from `jobs`.
- Worker writes normalized data and outputs to tables and storage.

### Your worker → LLM API
- Worker sends:
  - normalized transcript (or chunked)
  - strict extractor prompt (call #1) → extracted signals JSON
  - strict evaluator prompt (call #2) → evaluation JSON
- All calls are logged with prompt version hashes and model IDs.

### Frontend → Supabase
- Frontend uses Supabase client:
  - Auth user session
  - Query calls and evaluation summaries
  - Fetch evidence snippets and artifacts
- RLS ensures only authorized users can access data.

---

## Supabase Data Model

### Tables

#### `fathom_webhook_events`
Stores raw webhook events for idempotency and audit.

- `id` (uuid, pk)
- `webhook_id` (text, unique) — from `webhook-id` header
- `received_at` (timestamptz)
- `verified` (boolean)
- `raw_headers` (jsonb)
- `raw_body` (jsonb or text)
- `processing_status` (text: `queued|ignored|processed|error`)
- `error` (text, nullable)

#### `calls`
A call/meeting entity (one per Fathom recording/meeting).

- `id` (uuid, pk)
- `source` (text: `fathom`)
- `source_meeting_id` (text, nullable) — if provided
- `source_recording_id` (text, nullable) — if provided
- `title` (text)
- `start_time` (timestamptz, nullable)
- `end_time` (timestamptz, nullable)
- `share_url` (text, nullable)
- `fathom_url` (text, nullable)
- `created_at` (timestamptz)
- `created_by` (uuid, fk to auth.users, nullable)

#### `participants`
- `id` (uuid, pk)
- `call_id` (uuid, fk calls.id)
- `name` (text)
- `email` (text, nullable)
- `role` (text: `ae|prospect|unknown`)
- `source_label` (text, nullable)

#### `utterances`
Canonical transcript format.

- `id` (uuid, pk)
- `call_id` (uuid, fk calls.id)
- `idx` (int) — utterance order
- `speaker_participant_id` (uuid, fk participants.id, nullable)
- `speaker_label_raw` (text)
- `timestamp_start_sec` (numeric, nullable)
- `timestamp_end_sec` (numeric, nullable)
- `text_raw` (text)
- `text_normalized` (text)

Indexes:
- `(call_id, idx)`
- full-text index on `text_normalized` (optional)

#### `jobs`
DB-backed queue for processing pipelines.

- `id` (uuid, pk)
- `type` (text: `PROCESS_FATHOM_MEETING`, `REPROCESS_CALL`)
- `status` (text: `queued|running|succeeded|failed|dead`)
- `attempts` (int)
- `max_attempts` (int)
- `run_after` (timestamptz) — for backoff
- `payload` (jsonb) — contains webhook_event_id/call_id/etc
- `locked_at` (timestamptz, nullable)
- `locked_by` (text, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

#### `processing_runs`
One processing run per call per pipeline version.

- `id` (uuid, pk)
- `call_id` (uuid, fk calls.id)
- `status` (text: `running|succeeded|failed`)
- `started_at` (timestamptz)
- `finished_at` (timestamptz, nullable)
- `rubric_version` (text)
- `extractor_prompt_version` (text)
- `evaluator_prompt_version` (text)
- `model_extractor` (text)
- `model_evaluator` (text)
- `transcript_hash` (text)
- `error` (text, nullable)

#### `extracted_signals`
- `id` (uuid, pk)
- `processing_run_id` (uuid, fk processing_runs.id)
- `call_id` (uuid, fk calls.id)
- `signals_json` (jsonb) — strict schema
- `quality_checks` (jsonb)
- `created_at` (timestamptz)

#### `evaluations`
- `id` (uuid, pk)
- `processing_run_id` (uuid, fk processing_runs.id)
- `call_id` (uuid, fk calls.id)
- `overall_status` (text: `Qualified|Yellow|Disqualified|Needs Review`)
- `score` (int)
- `evaluation_json` (jsonb) — strict schema output
- `created_at` (timestamptz)

#### `user_settings` (optional)
- `user_id` (uuid, pk)
- `preferences` (jsonb)

---

## Security and Access Control (RLS)

Baseline rules:
- Only authenticated users can access data.
- A simple start:
  - Everyone in your org can view all calls and evaluations.
- Later:
  - Partition by team, workspace, or AE ownership.

Recommended:
- Add `workspace_id` to all tables and enforce RLS by workspace membership.

Webhook endpoint security:
- Webhook route is public but protected by signature verification + replay protection.

---

## Processing Pipeline Details

### Stage A: Webhook ingestion (fast path)
**Goal:** verify + persist + enqueue.

Steps:
1. Read raw body (must not parse before verification).
2. Verify signature using `webhook-id`, `webhook-timestamp`, `webhook-signature`.
3. Enforce replay window (e.g., 5 minutes).
4. Idempotency: upsert `fathom_webhook_events.webhook_id`.
5. Create a `jobs` row with type `PROCESS_FATHOM_MEETING`.

### Stage B: Normalize transcript
**Goal:** convert incoming transcript to canonical utterance rows.

Rules:
- Preserve `text_raw` exactly.
- Create `text_normalized` deterministically:
  - trim whitespace
  - collapse multiple spaces
  - standardize common unicode quotes
  - preserve numbers exactly
- Do not infer speaker roles if metadata is ambiguous.

### Stage C: Deterministic pre-extraction (optional but recommended)
**Goal:** reduce LLM misses and stabilize outputs.

- Run regex/lexicon extraction for:
  - employee count
  - competitor mentions
  - timeline phrases
  - SCIM/Okta/Azure AD mentions
  - “calendar invite”, “scheduled demo”, etc.
- Store matches as `heuristic_candidates` in `processing_runs` or a side table.

### Stage D: LLM Signal Extractor (call #1)
- Input: normalized transcript (or chunked) + strict JSON schema prompt.
- Output: `extracted_signals.signals_json` including evidence quotes and pointers.

Hard constraints:
- No guessing: unknown if not stated.
- Evidence is mandatory for any non-unknown value.

### Stage E: LLM Evaluator (call #2)
- Input: extracted signals JSON + rubric text.
- Output: `evaluations.evaluation_json`, flags, evidence_refs (paths into extracted JSON).

### Stage F: Rules-engine cross-check (recommended)
- Deterministically re-check hard disqualifier logic from extracted signals.
- If mismatch between evaluator and rules:
  - set `overall_status = Needs Review`
  - log mismatch in `processing_runs.error` or a `mismatch` field

---

## Versioning Strategy (Required for stability)

Store versions as plain strings:
- `rubric_version = "s0_v1"`
- `extractor_prompt_version = "extract_v1"`
- `evaluator_prompt_version = "eval_v1"`

Store prompt text in repo under `src/prompts/` and include:
- SHA256 hash of prompt content in `processing_runs`.

This enables:
- reproducible evaluations
- drift debugging
- rollback

---

## File and Folder Structure (Monorepo)

```text
transcript-evaluator/
├── apps/
│   └── web/                          # Next.js app (UI + API routes)
│       ├── app/
│       │   ├── (auth)/
│       │   ├── dashboard/
│       │   │   ├── calls/
│       │   │   │   ├── page.tsx       # list calls
│       │   │   │   └── [id]/page.tsx  # call detail: flags + evidence
│       │   │   └── settings/
│       │   ├── api/
│       │   │   ├── webhooks/
│       │   │   │   └── fathom/route.ts  # webhook ingestion
│       │   │   └── admin/
│       │   │       └── reprocess/route.ts
│       │   └── layout.tsx
│       ├── components/
│       ├── lib/
│       │   ├── supabase/
│       │   │   ├── client.ts          # browser client
│       │   │   └── server.ts          # server client (cookies)
│       │   └── auth.ts
│       ├── middleware.ts
│       └── next.config.js
│
├── packages/
│   ├── core/                          # shared domain logic
│   │   ├── src/
│   │   │   ├── ingestion/
│   │   │   │   ├── fathomPayload.ts   # types for webhook payload
│   │   │   │   ├── verifyWebhook.ts   # signature verification
│   │   │   │   ├── normalize.ts       # transcript normalization
│   │   │   │   └── mapping.ts         # payload → canonical utterances
│   │   │   ├── extraction/
│   │   │   │   ├── heuristic.ts       # regex/lexicon pre-extraction
│   │   │   │   ├── extractor.ts       # LLM call #1 wrapper
│   │   │   │   └── schemas.ts         # JSON schemas (zod/jsonschema)
│   │   │   ├── evaluation/
│   │   │   │   ├── evaluator.ts       # LLM call #2 wrapper
│   │   │   │   ├── rubric.ts          # rubric config
│   │   │   │   └── rulesEngine.ts     # deterministic cross-check
│   │   │   ├── storage/
│   │   │   │   ├── db.ts              # supabase client factory
│   │   │   │   └── repositories.ts    # DB operations
│   │   │   ├── prompts/
│   │   │   │   ├── extractor_v1.txt
│   │   │   │   └── evaluator_v1.txt
│   │   │   └── types/
│   │   │       ├── normalized.ts
│   │   │       ├── extractedSignals.ts
│   │   │       └── evaluationResult.ts
│   │   └── package.json
│   │
│   └── worker/                        # job runner (cron/long-running)
│       ├── src/
│       │   ├── runOnce.ts             # processes N jobs then exits
│       │   ├── processor.ts           # main pipeline orchestration
│       │   └── locks.ts               # job locking + heartbeats
│       └── package.json
│
├── supabase/
│   ├── migrations/                    # SQL migrations
│   ├── functions/                     # Supabase Edge Functions (optional)
│   └── seed.sql
│
├── .env.example
├── package.json
└── README.md
```

### What each part does

- `apps/web`: UI + webhook/API routes.
- `packages/core`: all deterministic logic (verification, normalization, schemas, prompts, rubric, rules-engine).
- `packages/worker`: asynchronous pipeline runner that processes jobs and writes outputs.
- `supabase/`: migrations and optional edge functions.

---

## Worker Execution Options

### Option 1: Supabase Scheduled Function (simple)
- A cron triggers every minute.
- It calls an internal endpoint or executes a function that processes queued jobs.

Pros: minimal infrastructure  
Cons: runtime limits; less control

### Option 2: External worker (recommended for control)
- Deploy `packages/worker` to a small serverless container (Fly, Render, ECS, etc.)
- It runs every minute (cron) or continuously.

Pros: reliable, controllable, scalable  
Cons: one more deployment

---

## Frontend UI Pages (minimum viable)

### Calls list
- Filters: status, date range, AE, competitor mentioned
- Columns: company, date, status, score, top flags

### Call detail
- Transcript viewer (optional: show utterances with timestamps)
- Extracted signals table
- Flags with evidence quotes
- “Missing info” checklist for next call
- “Reprocess” button (admin only)

---

## Observability

Log at each stage:
- webhook_id / event_id
- call_id
- processing_run_id
- rubric/prompt versions
- transcript hash
- job attempts + error

Add metrics (later):
- success rate
- average latency per stage
- top missing fields

---

## Deployment Notes

- Webhook endpoint must be publicly reachable over HTTPS.
- Ensure webhook route uses **raw request body** for signature verification.
- Secrets:
  - `FATHOM_WEBHOOK_SECRET`
  - `FATHOM_API_KEY` (if using API fallback)
  - `SUPABASE_SERVICE_ROLE_KEY` for worker (never expose to browser)
  - `OPENAI_API_KEY`

---

## Minimal Implementation Order

1. Supabase schema + migrations
2. Webhook ingestion route (verify + store + enqueue)
3. Worker: job locking + normalization
4. Store utterances
5. Add extractor (LLM call #1) + schema validation
6. Add evaluator (LLM call #2) + schema validation
7. UI: calls list + call detail with flags/evidence
8. Add deterministic rules-engine cross-check
9. Add reprocess/backfill tooling
