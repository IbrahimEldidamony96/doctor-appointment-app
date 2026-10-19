"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import { isISODate, isClockTime } from "@/lib/clinic-time";
import { createServiceClient } from "@/lib/supabase/server";
import { tryDeliverAppointmentNotifications } from "@/lib/notification-outbox";

const inputSchema = z.object({
  appointmentId: z.string().uuid(),
  expectedDate: z.string().refine(isISODate),
  expectedStartTime: z.string().refine(isClockTime),
  expectedEndTime: z.string().refine(isClockTime),
  date: z.string().refine(isISODate),
  startTime: z.string().refine(isClockTime),
  endTime: z.string().refine(isClockTime),
});
export type RescheduleInput = z.infer<typeof inputSchema>;
export type RescheduleResult =
  | { success: true }
  | { success: false; error: "forbidden" | "invalid_input" | "not_found"
    | "not_reschedulable" | "stale" | "same_slot"
    | "payment_in_progress" | "slot_taken" | "unknown" };

export async function rescheduleAppointment(input: RescheduleInput): Promise<RescheduleResult> {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "appointments:reschedule")) {
    return { success: false, error: "forbidden" };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.startTime >= parsed.data.endTime) {
    return { success: false, error: "invalid_input" };
  }
  const details = parsed.data;
  const supabase = createServiceClient();
  // Authorization and the compare-and-swap predicate are enforced by this action
  // and the serialized, service-role-only PostgreSQL RPC respectively.
  const { data, error } = await supabase.rpc("reschedule_staff_appointment", {
    p_appointment_id: details.appointmentId,
    p_actor_id: actor.id,
    p_expected_date: details.expectedDate,
    p_expected_start_time: details.expectedStartTime,
    p_expected_end_time: details.expectedEndTime,
    p_date: details.date,
    p_start_time: details.startTime,
    p_end_time: details.endTime,
  });
  if (error) {
    if (error.code === "23P01" || error.code === "23505") return { success: false, error: "slot_taken" };
    if (error.code === "23514" || error.code === "22007") return { success: false, error: "invalid_input" };
    return { success: false, error: "unknown" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { success: false, error: "unknown" };
  }
  const outcome = data as { success?: boolean; reason?: string };
  if (!outcome.success) {
    if (outcome.reason === "not_found" || outcome.reason === "not_reschedulable"
      || outcome.reason === "stale" || outcome.reason === "same_slot"
      || outcome.reason === "payment_in_progress" || outcome.reason === "invalid_input") {
      return { success: false, error: outcome.reason };
    }
    return { success: false, error: "unknown" };
  }

  // Post-commit opportunistic delivery; the outbox survives provider outages.
  await tryDeliverAppointmentNotifications(details.appointmentId);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath("/my-appointments");
  revalidatePath("/book");
  return { success: true };
}
