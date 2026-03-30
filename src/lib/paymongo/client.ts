import { createHmac, timingSafeEqual } from "node:crypto";
import { getPaymongoApiBaseUrl, getPaymongoSecretKey, getPaymongoWebhookSecret } from "@/lib/paymongo/env";

type JsonRecord = Record<string, unknown>;

function authHeaderFromSecret(secret: string): string {
  const token = Buffer.from(`${secret}:`).toString("base64");
  return `Basic ${token}`;
}

async function paymongoRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${getPaymongoApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: authHeaderFromSecret(getPaymongoSecretKey()),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const message =
      (data?.errors as Array<{ detail?: string }> | undefined)?.[0]?.detail ??
      `PayMongo API request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export type PaymongoCreateLinkInput = {
  amount: number;
  description: string;
  remarks?: string;
  metadata: Record<string, string>;
};

export type PaymongoCreateLinkResult = {
  id: string;
  checkout_url: string;
};

export async function createPaymongoPaymentLink(
  input: PaymongoCreateLinkInput,
): Promise<PaymongoCreateLinkResult> {
  const body = {
    data: {
      attributes: {
        amount: input.amount,
        description: input.description,
        remarks: input.remarks ?? "Courtly booking",
        metadata: input.metadata,
      },
    },
  };
  const payload = await paymongoRequest<{
    data: {
      id: string;
      attributes: {
        checkout_url: string;
      };
    };
  }>("/links", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    id: payload.data.id,
    checkout_url: payload.data.attributes.checkout_url,
  };
}

export async function createPaymongoRefund(params: {
  paymentId: string;
  amount: number;
  reason?: "requested_by_customer" | "others";
  notes?: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string }> {
  const payload = await paymongoRequest<{ data: { id: string } }>("/refunds", {
    method: "POST",
    body: JSON.stringify({
      data: {
        attributes: {
          payment_id: params.paymentId,
          amount: params.amount,
          reason: params.reason ?? "others",
          notes: params.notes ?? "Late success; booking could not be honored",
          metadata: params.metadata ?? {},
        },
      },
    }),
  });
  return { id: payload.data.id };
}

type PaymongoSignature = {
  timestamp: string;
  signature: string;
};

function parsePaymongoSignature(raw: string | null): PaymongoSignature | null {
  if (!raw) return null;
  const entries = raw.split(",").map((part) => part.trim());
  let timestamp = "";
  let signature = "";
  for (const entry of entries) {
    if (entry.startsWith("t=")) timestamp = entry.slice(2);
    if (entry.startsWith("te=")) signature = entry.slice(3);
  }
  if (!timestamp || !signature) return null;
  return { timestamp, signature };
}

export function verifyPaymongoWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
}): boolean {
  const parsed = parsePaymongoSignature(params.signatureHeader);
  if (!parsed) return false;
  const payloadToSign = `${parsed.timestamp}.${params.rawBody}`;
  const expectedHex = createHmac("sha256", getPaymongoWebhookSecret())
    .update(payloadToSign)
    .digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(parsed.signature, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export type PaymongoWebhookEvent = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  raw: JsonRecord;
};

export function parsePaymongoWebhookEvent(rawBody: string): PaymongoWebhookEvent {
  const payload = JSON.parse(rawBody) as {
    data?: {
      id?: string;
      type?: string;
      attributes?: Record<string, unknown>;
    };
  };
  const id = payload.data?.id;
  const type = payload.data?.type;
  if (!id || !type) {
    throw new Error("Invalid PayMongo webhook payload");
  }
  return {
    id,
    type,
    attributes: payload.data?.attributes ?? {},
    raw: payload as JsonRecord,
  };
}
