import crypto from "crypto";

const REPLAY_WINDOW_SEC = 300; // 5 minutes

export interface WebhookHeaders {
  webhookId: string;
  webhookTimestamp: string;
  webhookSignature: string;
}

export function parseWebhookHeaders(headers: Record<string, string | null>): WebhookHeaders | null {
  const webhookId = headers["webhook-id"];
  const webhookTimestamp = headers["webhook-timestamp"];
  const webhookSignature = headers["webhook-signature"];

  if (!webhookId || !webhookTimestamp || !webhookSignature) return null;

  return { webhookId, webhookTimestamp, webhookSignature };
}

export function verifyWebhookSignature(
  secret: string,
  webhookHeaders: WebhookHeaders,
  rawBody: string
): boolean {
  const { webhookId, webhookTimestamp, webhookSignature } = webhookHeaders;

  // Replay protection
  const nowSec = Math.floor(Date.now() / 1000);
  const tsSec = parseInt(webhookTimestamp, 10);
  if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > REPLAY_WINDOW_SEC) {
    return false;
  }

  // Secret comes as "whsec_<base64>" — decode the base64 portion
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expectedSig = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // Header may contain multiple space-separated sigs (e.g. "v1,<sig1> v1,<sig2>")
  const signatures = webhookSignature.split(" ");
  return signatures.some((sig) => {
    const parts = sig.split(",");
    const sigValue = parts.slice(1).join(",");
    return sigValue === expectedSig;
  });
}
