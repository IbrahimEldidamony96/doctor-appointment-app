"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";

const availabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMinutes: z.number().int().min(5).max(240),
});

export async function addAvailability(input: z.infer<typeof availabilitySchema>) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "unauthenticated" as const };

  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "invalid_input" as const };

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
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "unauthenticated" as const };

  const supabase = createServiceClient();
  await supabase.from("availability").delete().eq("id", id);

  revalidatePath("/dashboard/availability");
  return { success: true as const };
}

export async function toggleAvailabilityActive(id: string, isActive: boolean) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "unauthenticated" as const };

  const supabase = createServiceClient();
  await supabase.from("availability").update({ is_active: isActive }).eq("id", id);

  revalidatePath("/dashboard/availability");
  return { success: true as const };
}

const blockedDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isFullDay: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().max(200).optional(),
});

export async function addBlockedDate(input: z.infer<typeof blockedDateSchema>) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "unauthenticated" as const };

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
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "unauthenticated" as const };

  const supabase = createServiceClient();
  await supabase.from("blocked_dates").delete().eq("id", id);

  revalidatePath("/dashboard/availability");
  return { success: true as const };
}
