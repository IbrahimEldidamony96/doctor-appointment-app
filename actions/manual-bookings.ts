"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { isISODate, isClockTime } from "@/lib/clinic-time";
import { PHONE_PATTERN } from "@/lib/auth/constants";
import { tryDeliverAppointmentNotifications } from "@/lib/notification-outbox";

const manualBookingSchema = z.object({
  phone: z.string().regex(PHONE_PATTERN),
  patientName: z.string().trim().min(2).max(100),
  date: z.string().refine(isISODate),
  startTime: z.string().refine(isClockTime),
  endTime: z.string().refine(isClockTime),
  reason: z.string().trim().max(500).optional(),
});

export type CreateManualBookingInput = z.infer<typeof manualBookingSchema>;
export type CreateManualBookingResult =
  | { success: true; appointmentId: string }
  | { success: false; error: "forbidden" | "invalid_input" | "slot_taken" | "patient_inactive" | "unknown" };

export async function createManualBooking(input: CreateManualBookingInput): Promise<CreateManualBookingResult> {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "appointments:create_manual")) {
    return { success: false, error: "forbidden" };
  }
  const parsed = manualBookingSchema.safeParse(input);
  if (!parsed.success || parsed.data.startTime >= parsed.data.endTime) {
    return { success: false, error: "invalid_input" };
  }
  const { phone, patientName, date, startTime, endTime, reason } = parsed.data;
  // One database transaction: create/find patient, validate and create slot, record
  // staff actor. Existing account details are never overwritten by the receptionist.
  const { data, error } = await createServiceClient().rpc("create_staff_appointment", {
    p_actor_clerk_user_id: actor.clerkUserId,
    p_phone: phone,
    p_patient_name: patientName,
    p_date: date,
    p_start_time: startTime,
    p_end_time: endTime,
    p_reason: reason || null,
  });
  if (error || !data) {
    if (error?.code === "23P01" || error?.code === "23505") return { success: false, error: "slot_taken" };
    if (error?.code === "23503") return { success: false, error: "patient_inactive" };
    if (error?.code === "23514" || error?.code === "22023" || error?.code === "22007") {
      return { success: false, error: "invalid_input" };
    }
    return { success: false, error: "unknown" };
  }
  await tryDeliverAppointmentNotifications(data);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath("/book");
  return { success: true, appointmentId: data };
}
