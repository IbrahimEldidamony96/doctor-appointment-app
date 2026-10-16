import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const PAYMOB_BASE_URL = "https://accept.paymob.com";

export type PaymobTransaction = {
  amount_cents: number;
  created_at: string;
  currency: string;
  error_occured: boolean;
  has_parent_transaction: boolean;
  id: number | string;
  integration_id: number;
  is_3d_secure: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_refunded: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  order: { id: number | string };
  owner: number;
  pending: boolean;
  source_data: { pan: string; sub_type: string; type: string };
  success: boolean;
};

type IntentionResponse = { id: string; intention_order_id: number; client_secret: string };
type IntentionParams = {
  amountCents: number;
  specialReference: string;
  billingData: { firstName: string; lastName: string; phoneNumber: string; email: string };
  notificationUrl: string;
  redirectionUrl: string;
};

export function isPaymobConfigured(): boolean {
  const keys = ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_HMAC_SECRET", "PAYMOB_INTEGRATION_ID"];
  if (!keys.every((key) => Boolean(process.env[key]?.trim()))) return false;
  if (!/^[1-9]\d*$/.test(process.env.PAYMOB_INTEGRATION_ID!)) return false;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/"
      && !url.search && !url.hash;
  } catch { return false; }
}

export async function createPaymentIntention(params: IntentionParams): Promise<IntentionResponse> {
  if (!isPaymobConfigured()) throw new Error("Paymob is not configured");
  if (!Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error("Invalid payment amount");
  }
  const res = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountCents, currency: "EGP",
      payment_methods: [Number(process.env.PAYMOB_INTEGRATION_ID)],
      items: [{ name: "كشف طبي", amount: params.amountCents, description: "Consultation fee", quantity: 1 }],
      billing_data: {
        first_name: params.billingData.firstName,
        last_name: params.billingData.lastName,
        phone_number: params.billingData.phoneNumber,
        email: params.billingData.email,
        apartment: "NA", street: "NA", building: "NA",
        floor: "NA", city: "Cairo", state: "Cairo", country: "EGY",
      },
      special_reference: params.specialReference,
      notification_url: params.notificationUrl,
      redirection_url: params.redirectionUrl,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Paymob request failed with status ${res.status}`);
  const response: unknown = await res.json();
  if (!response || typeof response !== "object") throw new Error("Invalid Paymob response");
  const r = response as Record<string, unknown>;
  if (typeof r.id !== "string" || !Number.isSafeInteger(r.intention_order_id) ||
      typeof r.client_secret !== "string" || !r.client_secret) {
    throw new Error("Incomplete Paymob intention response");
  }
  return r as IntentionResponse;
}

export function getCheckoutUrl(clientSecret: string): string {
  const publicKey = process.env.PAYMOB_PUBLIC_KEY;
  if (!publicKey) throw new Error("Paymob public key missing");
  const url = new URL("/unifiedcheckout/", PAYMOB_BASE_URL);
  url.searchParams.set("publicKey", publicKey);
  url.searchParams.set("clientSecret", clientSecret);
  return url.toString();
}

const BOOL_FIELDS = [
  "error_occured", "has_parent_transaction", "is_3d_secure", "is_auth", "is_capture",
  "is_refunded", "is_standalone_payment", "is_voided", "pending", "success",
] as const;

export function verifyPaymobHmac(obj: unknown, signature: string | null): obj is PaymobTransaction {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret || !signature || !/^[a-fA-F0-9]{128}$/.test(signature) ||
      !obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (!BOOL_FIELDS.every((key) => typeof o[key] === "boolean") ||
      !Number.isSafeInteger(o.amount_cents) || typeof o.created_at !== "string" ||
      typeof o.currency !== "string" || typeof o.integration_id !== "number" ||
      !o.order || typeof o.order !== "object" ||
      !["string", "number"].includes(typeof (o.order as Record<string, unknown>).id) ||
      !o.source_data || typeof o.source_data !== "object" ||
      !["number", "string"].includes(typeof o.id) ||
      typeof o.owner !== "number") return false;
  const src = o.source_data as Record<string, unknown>;
  if (![src.pan, src.sub_type, src.type].every((value) => typeof value === "string")) return false;
  const signed = [
    o.amount_cents, o.created_at, o.currency, o.error_occured, o.has_parent_transaction,
    o.id, o.integration_id, o.is_3d_secure, o.is_auth, o.is_capture, o.is_refunded,
    o.is_standalone_payment, o.is_voided, (o.order as Record<string, unknown>).id,
    o.owner, o.pending, src.pan, src.sub_type, src.type, o.success,
  ].join("");
  const expected = createHmac("sha512", secret).update(signed).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

/** Only completed captured payments count as settled. */
export function isSettledPayment(tx: PaymobTransaction): boolean {
  return tx.success === true && tx.pending === false && !tx.error_occured &&
    !tx.is_auth && !tx.is_refunded && !tx.is_voided && !tx.has_parent_transaction &&
    (tx.is_standalone_payment || tx.is_capture);
}
