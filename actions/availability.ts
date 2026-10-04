"use server";

import { getAvailableSlots, type Slot } from "@/lib/availability";

export async function getAvailableSlotsAction(
  fromDateISO: string,
  days?: number
): Promise<Slot[]> {
  return getAvailableSlots(new Date(fromDateISO), days);
}
