import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyPaymobHmac, isSettledPayment } from "@/lib/paymob";

export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const obj = payload && typeof payload === "object" ? (payload as { obj?: unknown }).obj : null;
  if (!verifyPaymobHmac(obj, req.nextUrl.searchParams.get("hmac"))) {
    return NextResponse.json({ error: "invalid_hmac" }, { status: 401 });
  }
  // Every correlation field used below is part of the signed HMAC payload:
  // order.id, amount_cents, currency and transaction id. Ignore merchant_order_id.
  if (obj.currency !== "EGP" || obj.integration_id !== Number(process.env.PAYMOB_INTEGRATION_ID) ||
      !Number.isSafeInteger(obj.amount_cents) ||
      obj.amount_cents <= 0 || String(obj.order.id).length > 64) {
    return NextResponse.json({ error: "invalid_transaction" }, { status: 400 });
  }
  // Authorization-only, pending, refunded, voided and parent callbacks are
  // not final payments. Do not downgrade paid states from these notifications.
  if (obj.pending || obj.is_auth || obj.is_refunded || obj.is_voided ||
      obj.has_parent_transaction || obj.error_occured) {
    return NextResponse.json({ received: true, ignored: true });
  }
  const succeeded = isSettledPayment(obj);
  const failed = obj.success === false && !obj.pending;
  if (!succeeded && !failed) return NextResponse.json({ received: true, ignored: true });

  const { data, error } = await createServiceClient().rpc("apply_paymob_transaction", {
    p_order_id: String(obj.order.id),
    p_transaction_id: String(obj.id),
    p_amount_cents: obj.amount_cents,
    p_success: succeeded,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "temporary_unavailable" }, { status: 503 });
  }
  const result = data as { success?: boolean; reason?: string };
  if (!result.success) {
    // Unknown orders may be callbacks arriving before the intent was persisted.
    if (result.reason === "unknown_order") {
      return NextResponse.json({ error: "order_not_ready" }, { status: 503 });
    }
    return NextResponse.json({ error: "transaction_rejected" }, { status: 409 });
  }
  return NextResponse.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
}
