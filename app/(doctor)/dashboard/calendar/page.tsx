import { redirect } from "next/navigation";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import { getClinicDateTime } from "@/lib/clinic-time";
import { parseCalendarQuery, visibleCalendarDays } from "@/lib/clinic-calendar";
import { getCalendarData } from "@/lib/calendar-data";
import { CalendarBoard } from "@/components/doctor/calendar-board";

export const metadata = { title: "تقويم العيادة" };
export const dynamic = "force-dynamic";

type SearchParameters = Record<string, string | string[] | undefined>;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "calendar:view")) {
    redirect("/doctor-access-denied");
  }
  const today = getClinicDateTime().date;
  const query = parseCalendarQuery(await searchParams, today);
  const days = visibleCalendarDays(query.date, query.view);
  const calendar = await getCalendarData(days[0], days[days.length - 1], query.status, actor.role);
  return <CalendarBoard query={query} days={days} today={today}
    appointments={calendar.appointments} availability={calendar.availability}
    blocked={calendar.blocked} role={actor.role}/>;
}
