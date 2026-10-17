import { addCalendarDays, isISODate } from "./clinic-time";
import type { AppointmentStatus } from "./supabase/database.types";

export type CalendarView = "day" | "week";
export type CalendarStatus = AppointmentStatus | "all";
export type CalendarQuery = {
  view: CalendarView;
  date: string;
  status: CalendarStatus;
  appointment: string | null;
};
export type CalendarAppointment = {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  reason_for_visit: string | null;
  patient_name: string | null;
  patient_phone: string;
};

const statuses: ReadonlySet<string> = new Set([
  "all", "pending", "confirmed", "cancelled", "completed", "no_show",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RawParam = string | string[] | undefined;

function single(input: RawParam): string | undefined {
  return typeof input === "string" ? input : undefined;
}

/** Strict allowlisting; untrusted query strings never reach a DB filter verbatim. */
export function parseCalendarQuery(
  params: Record<string, RawParam>, today: string,
): CalendarQuery {
  const rawDate = single(params.date);
  const date = rawDate && calendarDateInRange(rawDate, today) ? rawDate : today;
  const view = single(params.view) === "day" ? "day" : "week";
  const requestedStatus = single(params.status);
  const status = requestedStatus && statuses.has(requestedStatus)
    ? requestedStatus as CalendarStatus : "all";
  const id = single(params.appointment);
  return { view, date, status, appointment: id && UUID.test(id) ? id : null };
}

export function calendarDateInRange(date: string, today: string, maxDays = 365): boolean {
  if (!isISODate(date) || !isISODate(today)) return false;
  const difference = (Date.parse(date + "T00:00:00Z") -
    Date.parse(today + "T00:00:00Z")) / 86400000;
  return Number.isInteger(difference) && Math.abs(difference) <= maxDays;
}

/** Saturday is the first day of the Egyptian clinic working week. */
export function saturdayOf(date: string): string {
  if (!isISODate(date)) throw new Error("Invalid clinic calendar date");
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  return addCalendarDays(date, -((weekday + 1) % 7));
}

export function visibleCalendarDays(date: string, view: CalendarView): string[] {
  if (!isISODate(date)) throw new Error("Invalid clinic calendar date");
  if (view === "day") return [date];
  const start = saturdayOf(date);
  return Array.from({ length: 7 }, (_, i) => addCalendarDays(start, i));
}

export function shiftCalendar(date: string, view: CalendarView, amount: -1 | 1): string {
  return addCalendarDays(date, (view === "week" ? 7 : 1) * amount);
}

export function calendarHref(query: CalendarQuery, changes: Partial<CalendarQuery> = {}): string {
  const current = { ...query, ...changes };
  const params = new URLSearchParams({
    view: current.view, date: current.date, status: current.status,
  });
  if (current.appointment) params.set("appointment", current.appointment);
  return "/dashboard/calendar?" + params.toString();
}

export function groupCalendarAppointments(
  days: readonly string[], appointments: readonly CalendarAppointment[],
): Map<string, CalendarAppointment[]> {
  const groups = new Map(days.map(day => [day, [] as CalendarAppointment[]]));
  for (const appointment of appointments) {
    const list = groups.get(appointment.appointment_date);
    if (list) list.push(appointment);
  }
  for (const list of groups.values()) {
    list.sort((a, b) =>
      a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id));
  }
  return groups;
}
