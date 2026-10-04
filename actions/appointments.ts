"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendBookingReceivedEmail } from "@/lib/resend";

const createAppointmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  reasonForVisit: z.string().max(500).optional(),
  // Collected here if this is the patient's first booking — see
  // 003_patients_name_nullable.sql for why `name` isn't required at signup.
  patientName: z.string().min(2).max(100).optional(),
  patientEmail: z.string().email().optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export type CreateAppointmentResult =
  | { success: true; appointmentId: string }
  | {
      success: false;
      error: "unauthenticated" | "invalid_input" | "slot_taken" | "unknown";
    };

export async function createAppointment(
  input: CreateAppointmentInput
): Promise<CreateAppointmentResult> {
  const session = await getPatientSession();
  if (!session) {
    return { success: false, error: "unauthenticated" };
  }

  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "invalid_input" };
  }

  const { date, startTime, endTime, reasonForVisit, patientName, patientEmail } =
    parsed.data;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      patient_id: session.patientId,
      appointment_date: date,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      reason_for_visit: reasonForVisit,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation — someone else took this slot first,
    // caught by uq_appointments_active_slot from 001_init_clinic_schema.sql
    if (error.code === "23505") {
      return { success: false, error: "slot_taken" };
    }
    return { success: false, error: "unknown" };
  }

  if (patientName || patientEmail) {
    await supabase
      .from("patients")
      .update({
        ...(patientName && { name: patientName }),
        ...(patientEmail && { email: patientEmail }),
      })
      .eq("id", session.patientId);
  }

  // Notifications — best-effort. A failed email/WhatsApp send shouldn't
  // fail a booking that already succeeded in the database.
  const { data: settings } = await supabase
    .from("settings")
    .select("doctor_notification_phone")
    .maybeSingle();

  await Promise.allSettled([
    sendBookingReceivedEmail(patientEmail ?? null, patientName ?? null, date, startTime),
    settings?.doctor_notification_phone
      ? sendWhatsAppMessage(
          settings.doctor_notification_phone,
          `طلب حجز جديد: ${patientName ?? "مريض"} يوم ${date} الساعة ${startTime}`
        )
      : Promise.resolve(),
  ]);

  revalidatePath("/my-appointments");
  revalidatePath("/book");

  return { success: true, appointmentId: data.id };
}

const cancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
});

export type CancelAppointmentResult =
  | { success: true }
  | {
      success: false;
      error:
        | "unauthenticated"
        | "invalid_input"
        | "not_your_appointment"
        | "too_late_to_cancel"
        | "not_cancellable"
        | "unknown";
    };

/**
 * Enforces settings.cancellation_notice_hours — the gap flagged back
 * when we built the settings page (it was stored but not checked
 * anywhere until now).
 */
export async function cancelAppointment(
  input: z.infer<typeof cancelAppointmentSchema>
): Promise<CancelAppointmentResult> {
  const session = await getPatientSession();
  if (!session) return { success: false, error: "unauthenticated" };

  const parsed = cancelAppointmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };

  const supabase = createServiceClient();

  const [{ data: appointment }, { data: settings }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, patient_id, status, appointment_date, start_time, patients(name)")
      .eq("id", parsed.data.appointmentId)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("cancellation_notice_hours, doctor_notification_phone")
      .maybeSingle(),
  ]);

  if (!appointment || appointment.patient_id !== session.patientId) {
    return { success: false, error: "not_your_appointment" };
  }

  if (!["pending", "confirmed"].includes(appointment.status)) {
    return { success: false, error: "not_cancellable" };
  }

  const noticeHours = settings?.cancellation_notice_hours ?? 24;
  const appointmentStart = new Date(
    `${appointment.appointment_date}T${appointment.start_time}`
  );
  const hoursUntil = (appointmentStart.getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntil < noticeHours) {
    return { success: false, error: "too_late_to_cancel" };
  }

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointment.id);

  if (error) return { success: false, error: "unknown" };

  if (settings?.doctor_notification_phone) {
    await sendWhatsAppMessage(
      settings.doctor_notification_phone,
      `المريض ${appointment.patients?.name ?? ""} ألغى موعد يوم ${appointment.appointment_date} الساعة ${appointment.start_time.slice(0, 5)}`
    ).catch(() => {}); // best-effort — don't fail the cancellation if this fails
  }

  revalidatePath("/my-appointments");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");

  return { success: true };
}
