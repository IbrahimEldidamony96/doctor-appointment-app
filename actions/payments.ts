"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { createPaymentIntention, getCheckoutUrl } from "@/lib/paymob";

const initiatePaymentSchema = z.object({
  appointmentId: z.string().uuid(),
});

export type InitiatePaymentResult =
  | { success: true; checkoutUrl: string }
  | {
      success: false;
      error:
        | "unauthenticated"
        | "invalid_input"
        | "not_your_appointment"
        | "already_paid"
        | "no_price_configured"
        | "unknown";
    };

export async function initiatePayment(
  input: z.infer<typeof initiatePaymentSchema>
): Promise<InitiatePaymentResult> {
  const session = await getPatientSession();
  if (!session) return { success: false, error: "unauthenticated" };

  const parsed = initiatePaymentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };

  const supabase = createServiceClient();

  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, patient_id, patients(name, phone, email)")
    .eq("id", parsed.data.appointmentId)
    .maybeSingle();

  if (!appointment || appointment.patient_id !== session.patientId) {
    return { success: false, error: "not_your_appointment" };
  }

  const { data: existingPaid } = await supabase
    .from("payments")
    .select("id")
    .eq("appointment_id", appointment.id)
    .eq("status", "paid")
    .maybeSingle();

  if (existingPaid) {
    return { success: false, error: "already_paid" };
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("consultation_price")
    .maybeSingle();

  if (!settings?.consultation_price) {
    return { success: false, error: "no_price_configured" };
  }

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      appointment_id: appointment.id,
      amount: settings.consultation_price,
      status: "pending",
      provider: "paymob",
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    return { success: false, error: "unknown" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const [firstName, ...rest] = (appointment.patients?.name ?? "Patient").split(" ");

  try {
    const intention = await createPaymentIntention({
      amountCents: Math.round(Number(settings.consultation_price) * 100),
      specialReference: payment.id,
      billingData: {
        firstName: firstName || "NA",
        lastName: rest.join(" ") || "NA",
        phoneNumber: appointment.patients?.phone ?? "NA",
        email: appointment.patients?.email ?? "na@example.com",
      },
      notificationUrl: `${baseUrl}/api/webhooks/paymob`,
      redirectionUrl: `${baseUrl}/my-appointments`,
    });

    // Store the intention id for cross-checking; the payments row's own
    // id (sent as special_reference) is what actually matches it back
    // in the webhook.
    await supabase
      .from("payments")
      .update({ transaction_id: intention.id })
      .eq("id", payment.id);

    return { success: true, checkoutUrl: getCheckoutUrl(intention.client_secret) };
  } catch {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { success: false, error: "unknown" };
  }
}
