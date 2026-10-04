"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  sendAppointmentConfirmedEmail,
  sendAppointmentCancelledEmail,
} from "@/lib/resend";

const statusSchema = z.enum(["confirmed", "cancelled", "completed", "no_show"]);

export async function updateAppointmentStatus(
  appointmentId: string,
  status: z.infer<typeof statusSchema>
) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false as const, error: "unauthenticated" as const };
  }

  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedStatus.success) {
    return { success: false as const, error: "invalid_status" as const };
  }

  const supabase = createServiceClient();

  const { data: appointment } = await supabase
    .from("appointments")
    .select("appointment_date, start_time, patients(name, email)")
    .eq("id", appointmentId)
    .maybeSingle();

  const { error } = await supabase
    .from("appointments")
    .update({ status: parsedStatus.data })
    .eq("id", appointmentId);

  if (error) {
    return { success: false as const, error: "unknown" as const };
  }

  if (appointment) {
    const time = appointment.start_time.slice(0, 5);

    if (parsedStatus.data === "confirmed") {
      await sendAppointmentConfirmedEmail(
        appointment.patients?.email ?? null,
        appointment.patients?.name ?? null,
        appointment.appointment_date,
        time
      ).catch(() => {});
    }

    if (parsedStatus.data === "cancelled") {
      await sendAppointmentCancelledEmail(
        appointment.patients?.email ?? null,
        appointment.patients?.name ?? null,
        appointment.appointment_date,
        time
      ).catch(() => {});
    }
  }

  revalidatePath("/dashboard/appointments");
  revalidatePath("/dashboard");

  return { success: true as const };
}
