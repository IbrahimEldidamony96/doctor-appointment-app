"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { sendDoctorNotification } from "@/lib/whatsapp";
import { tryDeliverAppointmentNotifications } from "@/lib/notification-outbox";
import { isISODate, isClockTime } from "@/lib/clinic-time";

const schema = z.object({
  date: z.string().refine(isISODate),
  startTime: z.string().refine(isClockTime),
  endTime: z.string().refine(isClockTime),
  reasonForVisit: z.string().trim().max(500).optional(),
  patientName: z.string().trim().min(2).max(100),
  patientEmail: z.union([z.email(), z.literal("")]).optional(),
});
export type CreateAppointmentInput = z.infer<typeof schema>;
export type CreateAppointmentResult =
  | { success: true; appointmentId: string }
  | { success: false; error: "unauthenticated" | "invalid_input" | "slot_taken" | "unknown" };

export async function createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
  const session = await getPatientSession();
  if (!session) return { success: false, error: "unauthenticated" };
  const parsed = schema.safeParse(input);
  if (!parsed.success || parsed.data.startTime >= parsed.data.endTime) {
    return { success: false, error: "invalid_input" };
  }
  const { date, startTime, endTime, reasonForVisit, patientName, patientEmail } = parsed.data;
  const supabase = createServiceClient();
  // One Postgres transaction: profile and appointment either commit together or neither commits.
  // DB checks booking window, active schedule, blocked dates and overlapping intervals.
  const { data: appointmentId, error } = await supabase.rpc("create_patient_appointment", {
    p_patient_id: session.patientId,
    p_date: date,
    p_start_time: startTime,
    p_end_time: endTime,
    p_reason: reasonForVisit ?? null,
    p_patient_name: patientName,
    p_patient_email: patientEmail || null,
  });
  if (error || !appointmentId) {
    if (error?.code === "23P01" || error?.code === "23505") return { success: false, error: "slot_taken" };
    if (error?.code === "23514" || error?.code === "23503" || error?.code === "22007") {
      return { success: false, error: "invalid_input" };
    }
    return { success: false, error: "unknown" };
  }
  const { data: settings } = await supabase.from("settings").select("doctor_notification_phone").maybeSingle();
  await Promise.allSettled([
    tryDeliverAppointmentNotifications(appointmentId),
    settings?.doctor_notification_phone
      ? sendDoctorNotification(settings.doctor_notification_phone, "new", patientName, date, startTime)
      : Promise.resolve(),
  ]);
  revalidatePath("/book");
  revalidatePath("/my-appointments");
  revalidatePath("/dashboard/appointments");
  return { success: true, appointmentId };
}

const cancelSchema = z.object({ appointmentId: z.string().uuid() });
export type CancelAppointmentResult = { success: true } |
  { success: false; error: "unauthenticated" | "invalid_input" | "not_your_appointment" |
      "too_late_to_cancel" | "not_cancellable" | "unknown" };

export async function cancelAppointment(input: z.infer<typeof cancelSchema>): Promise<CancelAppointmentResult> {
  const session = await getPatientSession();
  if (!session) return { success: false, error: "unauthenticated" };
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };
  const supabase = createServiceClient();
  // Row lock and notice period are evaluated by the DB against Cairo time.
  const { data, error } = await supabase.rpc("cancel_patient_appointment", {
    p_appointment_id: parsed.data.appointmentId,
    p_patient_id: session.patientId,
  });
  if (error) return { success: false, error: "unknown" };
  if (data !== "cancelled") {
    if (data === "not_your_appointment" || data === "not_cancellable" || data === "too_late_to_cancel") {
      return { success: false, error: data };
    }
    return { success: false, error: "unknown" };
  }
  const [{ data: appointment }, { data: settings }] = await Promise.all([
    supabase.from("appointments").select("appointment_date,start_time,patients(name)")
      .eq("id", parsed.data.appointmentId).eq("patient_id", session.patientId).single(),
    supabase.from("settings").select("doctor_notification_phone").maybeSingle(),
  ]);
  if (settings?.doctor_notification_phone && appointment) {
    await sendDoctorNotification(settings.doctor_notification_phone, "cancel",
      appointment.patients?.name ?? "Patient", appointment.appointment_date,
      appointment.start_time.slice(0, 5)).catch(() => {});
  }
  await tryDeliverAppointmentNotifications(parsed.data.appointmentId);
  revalidatePath("/my-appointments");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  return { success: true };
}
