import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export type Slot = {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
};

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Combines the weekly `availability` template, `blocked_dates`
 * exceptions, and already-booked `appointments` to produce the list
 * of open slots — nothing is precomputed or stored, so there's
 * nothing to fall out of sync.
 */
export async function getAvailableSlots(
  fromDate: Date,
  days?: number
): Promise<Slot[]> {
  const supabase = createServiceClient();

  let windowDays = days;
  if (!windowDays) {
    const { data: settings } = await supabase
      .from("settings")
      .select("booking_window_days")
      .maybeSingle();
    windowDays = settings?.booking_window_days ?? 30;
  }

  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + windowDays);

  const [{ data: availability }, { data: blockedDates }, { data: bookedAppointments }] =
    await Promise.all([
      supabase.from("availability").select("*").eq("is_active", true),
      supabase
        .from("blocked_dates")
        .select("*")
        .gte("date", toDateString(fromDate))
        .lte("date", toDateString(toDate)),
      supabase
        .from("appointments")
        .select("appointment_date, start_time")
        .in("status", ["pending", "confirmed"])
        .gte("appointment_date", toDateString(fromDate))
        .lte("appointment_date", toDateString(toDate)),
    ]);

  const blockedByDate = new Map<string, NonNullable<typeof blockedDates>>();
  for (const b of blockedDates ?? []) {
    const list = blockedByDate.get(b.date) ?? [];
    list.push(b);
    blockedByDate.set(b.date, list);
  }

  const bookedSet = new Set(
    (bookedAppointments ?? []).map(
      (a) => `${a.appointment_date}|${a.start_time}`
    )
  );

  const now = new Date();
  const todayStr = toDateString(now);
  const nowHHmm = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  const slots: Slot[] = [];

  for (let i = 0; i < windowDays; i++) {
    const date = new Date(fromDate);
    date.setDate(date.getDate() + i);
    const dateStr = toDateString(date);
    const dayOfWeek = date.getDay(); // 0 = Sunday

    const dayTemplates = (availability ?? []).filter(
      (a) => a.day_of_week === dayOfWeek
    );
    const dayBlocks = blockedByDate.get(dateStr) ?? [];

    if (dayBlocks.some((b) => b.is_full_day)) continue; // whole day off

    for (const template of dayTemplates) {
      let cursor = template.start_time.slice(0, 5); // "HH:mm:ss" -> "HH:mm"
      const end = template.end_time.slice(0, 5);

      while (cursor < end) {
        const slotEnd = addMinutes(cursor, template.slot_duration_minutes);
        if (slotEnd > end) break;

        // skip slots already in the past today
        if (dateStr === todayStr && cursor <= nowHHmm) {
          cursor = slotEnd;
          continue;
        }

        const isBlocked = dayBlocks.some(
          (b) =>
            !b.is_full_day &&
            b.start_time &&
            b.end_time &&
            cursor < b.end_time.slice(0, 5) &&
            slotEnd > b.start_time.slice(0, 5)
        );

        const isBooked = bookedSet.has(`${dateStr}|${cursor}:00`);

        if (!isBlocked && !isBooked) {
          slots.push({ date: dateStr, startTime: cursor, endTime: slotEnd });
        }

        cursor = slotEnd;
      }
    }
  }

  return slots;
}
