import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { hasPermission, type ClinicRole } from "./auth/permissions";
import type { CalendarAppointment, CalendarStatus } from "./clinic-calendar";

const PAGE_SIZE = 500;
const MAX_PAGES = 20; // Explicitly fail rather than silently hide patient visits.

export type CalendarSchedule = {
  day_of_week: number; start_time: string; end_time: string; is_active: boolean;
};
export type CalendarBlock = {
  date: string; is_full_day: boolean; start_time: string | null;
  end_time: string | null; reason: string | null;
};

/** The caller supplies the current database role; clinical details stay server-only for limited staff. */
export async function getCalendarData(
  start: string, end: string, status: CalendarStatus, role: ClinicRole | null,
): Promise<{
  appointments: CalendarAppointment[];
  availability: CalendarSchedule[];
  blocked: CalendarBlock[];
}> {
  if (!hasPermission(role, "calendar:view")) throw new Error("Clinic calendar access denied");
  const canViewClinicalDetails = hasPermission(role, "patients:manage");
  const client = createServiceClient();
  const [schedule, blocks] = await Promise.all([
    client.from("availability")
      .select("day_of_week,start_time,end_time,is_active").eq("is_active", true)
      .order("day_of_week", { ascending: true }),
    client.from("blocked_dates")
      .select("date,is_full_day,start_time,end_time,reason")
      .gte("date", start).lte("date", end).order("date", { ascending: true }),
  ]);
  if (schedule.error || blocks.error) throw new Error("Unable to load clinic calendar");

  const appointments: CalendarAppointment[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let query = client.from("appointments")
      .select("id,appointment_date,start_time,end_time,status,reason_for_visit,patients(name,phone)")
      .is("deleted_at", null)
      .gte("appointment_date", start).lte("appointment_date", end)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id", { ascending: true });
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error || !data) throw new Error("Unable to load clinic appointments");
    appointments.push(...data.map(item => ({
      id: item.id,
      appointment_date: item.appointment_date,
      start_time: item.start_time,
      end_time: item.end_time,
      status: item.status,
      reason_for_visit: canViewClinicalDetails ? item.reason_for_visit : null,
      patient_name: item.patients?.name ?? null,
      patient_phone: item.patients?.phone ?? "",
    })));
    if (data.length < PAGE_SIZE) {
      return { appointments, availability: schedule.data ?? [], blocked: blocks.data ?? [] };
    }
  }
  throw new Error("Clinic calendar exceeds the safe result window");
}
