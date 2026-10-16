"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { createPaymentIntention, getCheckoutUrl, isPaymobConfigured } from "@/lib/paymob";

const schema = z.object({ appointmentId: z.string().uuid() });
type PaymentRow = { id: string; amount: number; checkout_url: string | null };
type StartResult = { success?: boolean; existing?: boolean; reason?: string; payment?: PaymentRow };
export type InitiatePaymentResult =
  | { success: true; checkoutUrl: string }
  | { success: false; error: "unauthenticated" | "invalid_input" | "not_your_appointment" |
    "already_paid" | "no_price_configured" | "payment_in_progress" | "unknown" };

export async function initiatePayment(input: z.infer<typeof schema>): Promise<InitiatePaymentResult> {
  const session = await getPatientSession();
  if (!session) return { success: false, error: "unauthenticated" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };
  if (!isPaymobConfigured()) return { success: false, error: "unknown" };
  const supabase = createServiceClient();

  // Serializes starts per appointment and returns an existing pending attempt when possible.
  const { data, error } = await supabase.rpc("begin_payment_attempt", {
    p_appointment_id: parsed.data.appointmentId, p_patient_id: session.patientId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { success: false, error: "unknown" };
  }
  const started = data as StartResult;
  if (!started.success) {
    if (started.reason === "not_your_appointment" || started.reason === "already_paid" ||
        started.reason === "no_price_configured") return { success: false, error: started.reason };
    return { success: false, error: "unknown" };
  }
  const payment = started.payment;
  if (!payment?.id || !Number.isFinite(Number(payment.amount))) {
    return { success: false, error: "unknown" };
  }
  if (started.existing) {
    return payment.checkout_url
      ? { success: true, checkoutUrl: payment.checkout_url }
      : { success: false, error: "payment_in_progress" };
  }
  const { data: appt, error: detailsError } = await supabase.from("appointments")
    .select("id,patients(name,phone,email)").eq("id", parsed.data.appointmentId)
    .eq("patient_id", session.patientId).single();
  if (detailsError || !appt || !appt.patients?.phone) {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    return { success: false, error: "unknown" };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL!;
  const [firstName, ...lastName] = (appt.patients.name || "Patient").split(" ");
  let intention: Awaited<ReturnType<typeof createPaymentIntention>>;
  try {
    intention = await createPaymentIntention({
      amountCents: Math.round(Number(payment.amount) * 100),
      specialReference: payment.id,
      billingData: {
        firstName: firstName || "NA", lastName: lastName.join(" ") || "NA",
        phoneNumber: appt.patients.phone, email: appt.patients.email || "na@example.com",
      },
      notificationUrl: `${base}/api/webhooks/paymob`,
      redirectionUrl: `${base}/my-appointments`,
    });
  } catch {
    // Provider request failed or timed out: do not claim a charge succeeded.
    // A timeout might still have created a remote intent; reconcile before retrying in production.
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    return { success: false, error: "unknown" };
  }
  const checkoutUrl = getCheckoutUrl(intention.client_secret);
  const { data: stored, error: saveError } = await supabase.from("payments")
    .update({
      intention_id: intention.id,
      provider_order_id: String(intention.intention_order_id),
      checkout_url: checkoutUrl,
    }).eq("id", payment.id).eq("status", "pending").select("id").maybeSingle();
  if (saveError || !stored) {
    // Do not mark a remotely-created intention failed: needs operational reconciliation.
    return { success: false, error: "unknown" };
  }
  return { success: true, checkoutUrl };
}
