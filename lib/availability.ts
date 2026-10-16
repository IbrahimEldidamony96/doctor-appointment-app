import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { generateAvailableSlots, type Slot } from "@/lib/availability-slots";
import { addCalendarDays, getClinicDateTime } from "@/lib/clinic-time";

export type { Slot } from "@/lib/availability-slots";

/** Availability is display-only; PostgreSQL atomically validates every booking. */
export async function getAvailableSlots(fromDate = new Date(), requestedDays?: number): Promise<Slot[]> {
  if (Number.isNaN(fromDate.getTime())) return [];
  const supabase = createServiceClient();
  const { data: settings, error: settingsError } = await supabase.from("settings")
    .select("booking_window_days").maybeSingle();
  if (settingsError) throw new Error("Unable to load booking settings");
  const windowDays = Math.min(180, Math.max(1, settings?.booking_window_days ?? 30));
  const nowInstant = new Date();
  const today = getClinicDateTime(nowInstant);
  const requestedStart = getClinicDateTime(fromDate).date;
  const from = requestedStart > today.date ? requestedStart : today.date;
  const maxDateExclusive = addCalendarDays(today.date, windowDays);
  if (from >= maxDateExclusive) return [];
  const remainingDays = Math.max(0, Math.round(
    (Date.parse(maxDateExclusive + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000,
  ));
  const days = Math.min(remainingDays,
    requestedDays === undefined ? remainingDays : Math.max(1, Math.min(180, Math.floor(requestedDays))));
  if (!days) return [];
  const to = addCalendarDays(from, days - 1);
  const [{ data: available, error: aerr }, { data: blocks, error: berr }, { data: booked, error: cerr }] = await Promise.all([
    supabase.from("availability").select("day_of_week,start_time,end_time,slot_duration_minutes").eq("is_active", true),
    supabase.from("blocked_dates").select("date,is_full_day,start_time,end_time").gte("date", from).lte("date", to),
    supabase.from("appointments").select("appointment_date,start_time,end_time")
      .in("status", ["pending", "confirmed"]).is("deleted_at", null)
      .gte("appointment_date", from).lte("appointment_date", to),
  ]);
  if (aerr || berr || cerr) throw new Error("Unable to load booking availability");
  return generateAvailableSlots({
    fromDate: from, days, now: today, nowInstant,
    availability: available ?? [],
    blockedDates: blocks ?? [],
    appointments: booked ?? [],
  });
}
