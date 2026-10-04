import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const PAYMOB_BASE_URL = "https://accept.paymob.com";

type CreateIntentionParams = {
  amountCents: number;
  specialReference: string;
  billingData: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string;
  };
  notificationUrl: string;
  redirectionUrl: string;
};

type IntentionResponse = {
  id: string;
  client_secret: string;
};

/**
 * Uses the Intention API (v1/intention/) — Paymob's current recommended
 * entry point, not the legacy 3-step Accept API (auth → order →
 * payment_key). Verified against developers.paymob.com as of Sept 2026.
 */
export async function createPaymentIntention(
  params: CreateIntentionParams
): Promise<IntentionResponse> {
  const secretKey = process.env.PAYMOB_SECRET_KEY;
  const integrationId = process.env.PAYMOB_INTEGRATION_ID;

  if (!secretKey || !integrationId) {
    throw new Error("Missing Paymob environment variables");
  }

  const res = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountCents,
      currency: "EGP",
      payment_methods: [Number(integrationId)],
      items: [
        {
          name: "كشف طبي",
          amount: params.amountCents,
          description: "Consultation fee",
          quantity: 1,
        },
      ],
      billing_data: {
        first_name: params.billingData.firstName,
        last_name: params.billingData.lastName,
        phone_number: params.billingData.phoneNumber,
        email: params.billingData.email,
        // Paymob requires these fields even for a non-shipped service —
        // "NA" placeholders are the documented convention.
        apartment: "NA",
        street: "NA",
        building: "NA",
        floor: "NA",
        city: "Cairo",
        state: "Cairo",
        country: "EGY",
      },
      special_reference: params.specialReference,
      notification_url: params.notificationUrl,
      redirection_url: params.redirectionUrl,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Paymob intention failed (${res.status}): ${body}`);
  }

  return res.json();
}

export function getCheckoutUrl(clientSecret: string) {
  const publicKey = process.env.PAYMOB_PUBLIC_KEY;
  return `${PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`;
}

/**
 * Verifies the Transaction Processed Callback HMAC. Paymob does NOT sign
 * the raw body — it computes HMAC-SHA512 over a fixed, ordered
 * concatenation of 20 specific fields (no separators) and sends the hex
 * digest as the `hmac` query parameter. Field order confirmed against
 * developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback
 */
export function verifyPaymobHmac(
  obj: Record<string, any>,
  hmacParam: string | null
): boolean {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret || !hmacParam) return false;

  const s = obj.source_data ?? {};
  const signed = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order?.id,
    obj.owner,
    obj.pending,
    s.pan,
    s.sub_type,
    s.type,
    obj.success,
  ].join("");

  const expected = createHmac("sha512", secret).update(signed).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(hmacParam));
  } catch {
    return false;
  }
}
