"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  clinicName: z.string().min(1).max(150),
  bookingWindowDays: z.number().int().min(1).max(180),
  cancellationNoticeHours: z.number().int().min(0).max(168),
  defaultSlotMinutes: z.number().int().min(5).max(240),
  doctorNotificationPhone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional()
    .or(z.literal("")),
  consultationPrice: z.number().min(0).max(100000),
});

export async function updateSettings(input: z.infer<typeof settingsSchema>) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "unauthenticated" as const };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "invalid_input" as const };

  const supabase = createServiceClient();

  const { data: existing } = await supabase.from("settings").select("id").maybeSingle();

  const payload = {
    clinic_name: parsed.data.clinicName,
    booking_window_days: parsed.data.bookingWindowDays,
    cancellation_notice_hours: parsed.data.cancellationNoticeHours,
    default_slot_minutes: parsed.data.defaultSlotMinutes,
    doctor_notification_phone: parsed.data.doctorNotificationPhone || null,
    consultation_price: parsed.data.consultationPrice,
  };

  const { error } = existing
    ? await supabase.from("settings").update(payload).eq("id", existing.id)
    : await supabase.from("settings").insert(payload);

  if (error) return { success: false as const, error: "unknown" as const };

  revalidatePath("/dashboard/settings");
  return { success: true as const };
}
