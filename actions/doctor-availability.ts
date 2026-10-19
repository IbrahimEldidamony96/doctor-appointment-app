"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireClinicPermission } from "@/lib/auth/clinic-actor";
import { createServiceClient } from "@/lib/supabase/server";
import { isISODate, isClockTime } from "@/lib/clinic-time";

const availabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().refine(isClockTime),
  endTime: z.string().refine(isClockTime),
  slotDurationMinutes: z.number().int().min(5).max(240),
});

export async function addAvailability(input: z.infer<typeof availabilitySchema>) {
  if (!await requireClinicPermission("schedule:manage")) return { success: false as const, error: "unauthenticated" as const };

  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success || parsed.data.startTime >= parsed.data.endTime ||
      (Number(parsed.data.endTime.slice(0, 2)) * 60 + Number(parsed.data.endTime.slice(3)) -
       Number(parsed.data.startTime.slice(0, 2)) * 60 - Number(parsed.data.startTime.slice(3))) < parsed.data.slotDurationMinutes)
    return { success: false as const, error: "invalid_input" as const };

  const supabase = createServiceClient();
  const { error } = await supabase.from("availability").insert({
    day_of_week: parsed.data.dayOfWeek,
    start_time: `${parsed.data.startTime}:00`,
    end_time: `${parsed.data.endTime}:00`,
    slot_duration_minutes: parsed.data.slotDurationMinutes,
  });

  if (error) return { success: false as const, error: "unknown" as const };

  revalidatePath("/dashboard/availability");
  return { success: true as const };
}

export async function deleteAvailability(id: string) {
  if (!await requireClinicPermission("schedule:manage")) return { success: false as const, error: "unauthenticated" as const };
  if (!z.string().uuid().safeParse(id).success) return { success: false as const, error: "invalid_input" as const };

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("availability").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) return { success: false as const, error: "not_found_or_failed" as const };

  revalidatePath("/dashboard/availability");
  return { success: true as const };
}

export async function toggleAvailabilityActive(id: string, isActive: boolean) {
  if (!await requireClinicPermission("schedule:manage")) return { success: false as const, error: "unauthenticated" as const };

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("availability").update({ is_active: isActive })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) return { success: false as const, error: "not_found_or_failed" as const };

  revalidatePath("/dashboard/availability");
  return { success: true as const };
}

const blockedDateSchema = z.object({
  date: z.string().refine(isISODate),
  isFullDay: z.boolean(),
  startTime: z.string().refine(isClockTime).optional(),
  endTime: z.string().refine(isClockTime).optional(),
  reason: z.string().max(200).optional(),
}).superRefine((value, context) => {
  if (!value.isFullDay && (!value.startTime || !value.endTime || value.startTime >= value.endTime)) {
    context.addIssue({ code: "custom", message: "Partial blocked dates require a valid interval", path: ["startTime"] });
  }
});

export async function addBlockedDate(input: z.infer<typeof blockedDateSchema>) {
  if (!await requireClinicPermission("schedule:manage")) return { success: false as const, error: "unauthenticated" as const };

  const parsed = blockedDateSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "invalid_input" as const };

  const supabase = createServiceClient();
  const { error } = await supabase.from("blocked_dates").insert({
    date: parsed.data.date,
    is_full_day: parsed.data.isFullDay,
    start_time: parsed.data.isFullDay ? null : `${parsed.data.startTime}:00`,
    end_time: parsed.data.isFullDay ? null : `${parsed.data.endTime}:00`,
    reason: parsed.data.reason,
  });

  if (error) return { success: false as const, error: "unknown" as const };

  revalidatePath("/dashboard/availability");
  return { success: true as const };
}

export async function deleteBlockedDate(id: string) {
  if (!await requireClinicPermission("schedule:manage")) return { success: false as const, error: "unauthenticated" as const };

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("blocked_dates").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) return { success: false as const, error: "not_found_or_failed" as const };

  revalidatePath("/dashboard/availability");
  return { success: true as const };
}
