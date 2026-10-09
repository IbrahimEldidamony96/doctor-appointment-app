import { addCalendarDays, getClinicInstant, isClockTime, timeToMinutes } from "./clinic-time";

export type Slot = { date: string; startTime: string; endTime: string };
export type AvailabilityTemplate = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};
export type BlockedPeriod = {
  date: string;
  is_full_day: boolean;
  start_time: string | null;
  end_time: string | null;
};
export type BookedPeriod = {
  appointment_date: string;
  start_time: string;
  end_time: string;
};

const formatTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function generateAvailableSlots({
  fromDate, days, now, nowInstant, availability, blockedDates, appointments,
}: {
  fromDate: string;
  days: number;
  now: { date: string; time: string };
  nowInstant?: Date;
  availability: AvailabilityTemplate[];
  blockedDates: BlockedPeriod[];
  appointments: BookedPeriod[];
}): Slot[] {
  const slots = new Map<string, Slot>();
  for (let day = 0; day < days; day++) {
    const date = addCalendarDays(fromDate, day);
    if (date < now.date) continue;
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const blocks = blockedDates.filter((block) => block.date === date);
    if (blocks.some((block) => block.is_full_day)) continue;
    const booked = appointments.filter((appointment) => appointment.appointment_date === date);
    for (const template of availability.filter((entry) => entry.day_of_week === weekday)) {
      const start = template.start_time.slice(0, 5);
      const end = template.end_time.slice(0, 5);
      const duration = template.slot_duration_minutes;
      // Ignore corrupt legacy schedules instead of entering a non-advancing or wrapping loop.
      if (!isClockTime(start) || !isClockTime(end) || start >= end ||
          !Number.isInteger(duration) || duration < 5 || duration > 240) continue;
      for (let cursor = timeToMinutes(start); cursor + duration <= timeToMinutes(end); cursor += duration) {
        const startTime = formatTime(cursor);
        const endTime = formatTime(cursor + duration);
        const instant = getClinicInstant(date, startTime);
        if (!instant || !getClinicInstant(date, endTime)) continue;
        if (nowInstant ? instant.getTime() <= nowInstant.getTime() : date === now.date && startTime <= now.time) continue;
        const isBlocked = blocks.some((block) => block.start_time && block.end_time &&
          startTime < block.end_time.slice(0, 5) && endTime > block.start_time.slice(0, 5));
        const isBooked = booked.some((appointment) =>
          startTime < appointment.end_time.slice(0, 5) && endTime > appointment.start_time.slice(0, 5));
        if (!isBlocked && !isBooked) {
          slots.set(`${date}|${startTime}|${endTime}`, { date, startTime, endTime });
        }
      }
    }
  }
  return [...slots.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
}
