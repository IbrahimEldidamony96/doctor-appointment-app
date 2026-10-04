import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyPaymobHmac } from "@/lib/paymob";

export async function POST(req: NextRequest) {
  const hmacParam = req.nextUrl.searchParams.get("hmac");
  const body = await req.json();
  const obj = body?.obj;

  if (!obj || !verifyPaymobHmac(obj, hmacParam)) {
    return NextResponse.json({ error: "invalid_hmac" }, { status: 401 });
  }

  // We sent our payments.id as special_reference when creating the
  // intention — Paymob returns it as merchant_order_id in the callback.
  // NOTE: verify this exact path (obj.order.merchant_order_id vs.
  // obj.merchant_order_id) against a real test transaction in the
  // Paymob dashboard before going live — the Intention API's callback
  // shape for this field isn't 100% pinned down in the docs I could
  // check.
  const paymentId: string | undefined =
    obj.order?.merchant_order_id ?? obj.merchant_order_id;

  if (!paymentId) {
    return NextResponse.json({ error: "missing_reference" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const success = Boolean(obj.success);

  const { data: payment } = await supabase
    .from("payments")
    .update({
      status: success ? "paid" : "failed",
      transaction_id: String(obj.id),
      paid_at: success ? new Date().toISOString() : null,
    })
    .eq("id", paymentId)
    .select("appointment_id")
    .maybeSingle();

  // Auto-confirm the appointment once payment succeeds, but only if it's
  // still pending — don't override a doctor's manual decision either way.
  if (success && payment?.appointment_id) {
    await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", payment.appointment_id)
      .eq("status", "pending");
  }

  return NextResponse.json({ received: true });
}
