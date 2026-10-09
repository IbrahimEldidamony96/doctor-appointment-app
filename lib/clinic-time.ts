export const CLINIC_TIME_ZONE = "Africa/Cairo";

const clinicDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function getClinicDateTime(now = new Date()): { date: string; time: string } {
  const parts = clinicDateTimeFormatter.formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === name)?.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isClockTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

const offsetsByDate = new Map<string, number[]>();

/** Null for a DST gap; choose the later occurrence in a repeated hour, as PostgreSQL does. */
export function getClinicInstant(date: string, time: string): Date | null {
  if (!isISODate(date) || !isClockTime(time)) return null;
  const wallTime = Date.parse(`${date}T${time}:00.000Z`);
  let offsets = offsetsByDate.get(date);
  if (!offsets) {
    const noon = Date.parse(`${date}T12:00:00.000Z`);
    offsets = [...new Set([-36, 0, 36].map((hours) => {
      const sampled = noon + hours * 3600000;
      const local = getClinicDateTime(new Date(sampled));
      return Date.parse(`${local.date}T${local.time}:00.000Z`) - sampled;
    }))];
    if (offsetsByDate.size >= 400) {
      const firstDate = offsetsByDate.keys().next().value;
      if (firstDate) offsetsByDate.delete(firstDate);
    }
    offsetsByDate.set(date, offsets);
  }
  const candidates = offsets.map((offset) => wallTime - offset).filter((instant) => {
    const local = getClinicDateTime(new Date(instant));
    return local.date === date && local.time === time;
  });
  return candidates.length ? new Date(Math.max(...candidates)) : null;
}
