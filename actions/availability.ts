"use server";

import { getAvailableSlots, type Slot } from "@/lib/availability";
import { getClinicDateTime, isISODate } from "@/lib/clinic-time";

export async function getAvailableSlotsAction(fromDateISO: string, days?: number): Promise<Slot[]> {
  if (typeof fromDateISO !== "string" || fromDateISO.length > 35 ||
      !Number.isFinite(Date.parse(fromDateISO))) throw new Error("Invalid start date");
  if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 180)) {
    throw new Error("Invalid availability range");
  }
  const requested = new Date(fromDateISO);
  const requestedDay = getClinicDateTime(requested).date;
  const today = getClinicDateTime().date;
  // Queries far into the past/future offer no useful booking choices.
  if (!isISODate(requestedDay) || requestedDay > today && requestedDay > 
    getClinicDateTime(new Date(Date.now() + 180 * 86400000)).date) return [];
  return getAvailableSlots(requested, days);
}
