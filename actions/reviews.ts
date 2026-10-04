"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getPatientSession } from "@/lib/auth/get-patient-session";

const submitReviewSchema = z.object({
  appointmentId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export type SubmitReviewResult =
  | { success: true }
  | {
      success: false;
      error:
        | "unauthenticated"
        | "invalid_input"
        | "not_your_appointment"
        | "not_completed"
        | "already_reviewed"
        | "unknown";
    };

export async function submitReview(
  input: z.infer<typeof submitReviewSchema>
): Promise<SubmitReviewResult> {
  const session = await getPatientSession();
  if (!session) return { success: false, error: "unauthenticated" };

  const parsed = submitReviewSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };

  const { appointmentId, rating, comment } = parsed.data;
  const supabase = createServiceClient();

  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, patient_id, status")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment || appointment.patient_id !== session.patientId) {
    return { success: false, error: "not_your_appointment" };
  }

  if (appointment.status !== "completed") {
    return { success: false, error: "not_completed" };
  }

  const { error } = await supabase.from("reviews").insert({
    appointment_id: appointmentId,
    patient_id: session.patientId,
    rating,
    comment,
  });

  if (error) {
    // 23505 = unique_violation — this appointment already has a review
    if (error.code === "23505") {
      return { success: false, error: "already_reviewed" };
    }
    return { success: false, error: "unknown" };
  }

  revalidatePath("/dashboard/reviews");
  revalidatePath("/my-appointments");

  return { success: true };
}
