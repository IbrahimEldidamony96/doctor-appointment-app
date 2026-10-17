"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { canChangeAppointmentStatus } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { sendAppointmentConfirmedEmail, sendAppointmentCancelledEmail } from "@/lib/resend";

const statusSchema = z.enum(["confirmed", "cancelled", "completed", "no_show"]);
type Status = z.infer<typeof statusSchema>;
type Result = { success: true } | { success: false; error: "unauthenticated" | "forbidden" | "invalid_input" | "invalid_transition" | "unknown" };

const allowedFrom: Record<Status, ("pending" | "confirmed")[]> = {
  confirmed: ["pending"], cancelled: ["pending", "confirmed"],
  completed: ["confirmed"], no_show: ["confirmed"],
};

export async function updateAppointmentStatus(appointmentId: string, status: Status): Promise<Result> {
  const actor = await getClinicActor();
  if (!actor) return { success: false, error: "unauthenticated" };
  if (!z.string().uuid().safeParse(appointmentId).success || !statusSchema.safeParse(status).success) {
    return { success: false, error: "invalid_input" };
  }
  if (!canChangeAppointmentStatus(actor.role, status)) return { success: false, error: "forbidden" };
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("appointments")
    .update({ status }).eq("id", appointmentId)
    .in("status", allowedFrom[status]).is("deleted_at", null)
    .select("appointment_date,start_time,patients(name,email)").maybeSingle();
  if (error) {
    if (error.code === "23514") return { success: false, error: "invalid_transition" };
    return { success: false, error: "unknown" };
  }
  if (!data) return { success: false, error: "invalid_transition" };
  const send = status === "confirmed" ? sendAppointmentConfirmedEmail
    : status === "cancelled" ? sendAppointmentCancelledEmail : null;
  if (send) {
    await send(data.patients?.email ?? null, data.patients?.name ?? null,
      data.appointment_date, data.start_time.slice(0, 5)).catch(() => {});
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/my-appointments");
  return { success: true };
}
