"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { canChangeAppointmentStatus } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { tryDeliverAppointmentNotifications } from "@/lib/notification-outbox";

const statusSchema = z.enum(["confirmed", "cancelled", "completed", "no_show"]);
type Status = z.infer<typeof statusSchema>;
type Result = { success: true } | { success: false; error: "unauthenticated" | "forbidden" | "invalid_input" | "invalid_transition" | "unknown" };

export async function updateAppointmentStatus(appointmentId: string, status: Status): Promise<Result> {
  const actor = await getClinicActor();
  if (!actor) return { success: false, error: "unauthenticated" };
  if (!z.string().uuid().safeParse(appointmentId).success || !statusSchema.safeParse(status).success) {
    return { success: false, error: "invalid_input" };
  }
  if (!canChangeAppointmentStatus(actor.role, status)) return { success: false, error: "forbidden" };
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("update_staff_appointment_status", {
    p_appointment_id: appointmentId,
    p_actor_id: actor.id,
    p_status: status,
  });
  if (error) {
    if (error.code === "23514") return { success: false, error: "invalid_transition" };
    return { success: false, error: "unknown" };
  }
  if (data !== "updated") {
    return { success: false, error: data === "invalid_transition" ? "invalid_transition" : "invalid_input" };
  }
  // The audit and notification rows committed alongside the status mutation.
  // External email delivery is independent of booking success.
  await tryDeliverAppointmentNotifications(appointmentId);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/my-appointments");
  return { success: true };
}
