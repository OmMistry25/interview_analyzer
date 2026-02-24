import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  parseWebhookHeaders,
  verifyWebhookSignature,
} from "@transcript-evaluator/core/src/ingestion/verifyWebhook";
import {
  upsertWebhookEvent,
  enqueueJob,
} from "@transcript-evaluator/core/src/storage/repositories";

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const headerEntries: Record<string, string | null> = {
    "webhook-id": req.headers.get("webhook-id"),
    "webhook-timestamp": req.headers.get("webhook-timestamp"),
    "webhook-signature": req.headers.get("webhook-signature"),
  };

  const webhookHeaders = parseWebhookHeaders(headerEntries);
  if (!webhookHeaders) {
    return NextResponse.json({ error: "Missing webhook headers" }, { status: 401 });
  }

  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) {
    console.error("FATHOM_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const valid = verifyWebhookSignature(secret, webhookHeaders, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const db = getServiceClient();

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = rawBody;
  }

  const event = await upsertWebhookEvent(db, {
    webhookId: webhookHeaders.webhookId,
    verified: true,
    rawHeaders: headerEntries as Record<string, string>,
    rawBody: parsedBody,
  });

  await enqueueJob(db, {
    type: "PROCESS_FATHOM_MEETING",
    payload: { webhook_event_id: event.id },
  });

  return NextResponse.json({ ok: true, event_id: event.id });
}
