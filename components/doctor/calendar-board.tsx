import Link from "next/link";
import { CalendarDays, Clock3, ChevronLeft, ChevronRight, CalendarPlus, ArrowUpLeft, UserRound, Phone, X } from "lucide-react";
import type { ClinicRole } from "@/lib/auth/permissions";
import type { CalendarAppointment, CalendarQuery, CalendarStatus } from "@/lib/clinic-calendar";
import { calendarHref, groupCalendarAppointments, calendarDateInRange, shiftCalendar } from "@/lib/clinic-calendar";
import type { CalendarSchedule, CalendarBlock } from "@/lib/calendar-data";
import { AppointmentActions } from "@/components/doctor/appointment-actions";

const statuses: { value: CalendarStatus; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "pending", label: "بانتظار التأكيد" },
  { value: "confirmed", label: "مؤكد" },
  { value: "completed", label: "تمت الزيارة" },
  { value: "cancelled", label: "ملغي" },
  { value: "no_show", label: "لم يحضر" },
];
const palette = {
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  confirmed: "border-teal-200 bg-teal-50 text-teal-900",
  cancelled: "border-red-200 bg-red-50 text-red-900",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-900",
  no_show: "border-slate-200 bg-slate-100 text-slate-700",
} as const;
const statusNames = Object.fromEntries(statuses.map(item => [item.value, item.label]));
const formatDay = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "UTC", weekday: "long", day: "numeric", month: "short",
});
const formatFullDate = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "UTC", day: "numeric", month: "long", year: "numeric",
});
function dateLabel(date: string) {
  return formatDay.format(new Date(date + "T12:00:00Z"));
}
function fullDate(date: string) {
  return formatFullDate.format(new Date(date + "T12:00:00Z"));
}
function weekday(date: string) {
  return new Date(date + "T00:00:00Z").getUTCDay();
}
function hhmm(time: string) { return time.slice(0, 5); }
function scheduleLabel(date: string, availability: CalendarSchedule[]) {
  const windows = availability.filter(item => item.day_of_week === weekday(date));
  return windows.length ? windows.map(item => hhmm(item.start_time) + "–" + hhmm(item.end_time)).join("، ") : "خارج أوقات العمل";
}
function blocksFor(date: string, blocked: CalendarBlock[]) {
  return blocked.filter(item => item.date === date);
}

function AppointmentTile({
  appointment, query, compact = false,
}: {
  appointment: CalendarAppointment; query: CalendarQuery; compact?: boolean;
}) {
  return <Link href={calendarHref(query, { appointment: appointment.id })}
    aria-current={query.appointment === appointment.id ? "true" : undefined}
    className={`block rounded-xl border p-3 text-right transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-600 ${palette[appointment.status]} ${query.appointment === appointment.id ? "ring-2 ring-teal-600" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
      <span dir="ltr">{hhmm(appointment.start_time)}–{hhmm(appointment.end_time)}</span>
      {!compact && <span>{statusNames[appointment.status]}</span>}
    </div>
    <p className="mt-1 truncate text-sm font-extrabold">{appointment.patient_name ?? "بدون اسم"}</p>
    {compact && <p className="mt-1 text-[11px]">{statusNames[appointment.status]}</p>}
  </Link>;
}

export function CalendarBoard({
  query, days, appointments, availability, blocked, today, role,
}: {
  query: CalendarQuery; days: string[]; appointments: CalendarAppointment[];
  availability: CalendarSchedule[]; blocked: CalendarBlock[];
  today: string; role: ClinicRole;
}) {
  const grouped = groupCalendarAppointments(days, appointments);
  const first = days[0];
  const last = days[days.length - 1];
  const back = shiftCalendar(query.date, query.view, -1);
  const forward = shiftCalendar(query.date, query.view, 1);
  const selected = appointments.find(item => item.id === query.appointment);
  const pending = appointments.filter(item => item.status === "pending").length;
  const confirmed = appointments.filter(item => item.status === "confirmed").length;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <span className="eyebrow"><CalendarDays size={16}/> تقويم العيادة</span>
        <h1 className="mt-3 page-title">جدول الحجوزات</h1>
        <p className="page-desc">عرض يومي وأسبوعي بتوقيت القاهرة، للمواعيد والحالات والتغييرات.</p>
      </div>
      <Link href="/dashboard/appointments/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-800">
        <CalendarPlus size={18}/> حجز يدوي
      </Link>
    </header>

    <section className="surface space-y-5 p-5 sm:p-6" aria-label="خيارات التقويم">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-2">
          <Link href={calendarHref(query, { view: "day", appointment: null })}
            aria-current={query.view === "day" ? "page" : undefined}
            className={`rounded-lg px-5 py-2 text-sm font-bold ${query.view === "day" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-teal-50"}`}>يومي</Link>
          <Link href={calendarHref(query, { view: "week", appointment: null })}
            aria-current={query.view === "week" ? "page" : undefined}
            className={`rounded-lg px-5 py-2 text-sm font-bold ${query.view === "week" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-teal-50"}`}>أسبوعي</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {calendarDateInRange(back, today) ?
            <Link aria-label="الفترة السابقة" href={calendarHref(query, { date: back, appointment: null })}
              className="rounded-xl border p-2.5 text-slate-700 hover:bg-slate-50"><ChevronRight size={19}/></Link> :
            <span className="rounded-xl border p-2.5 opacity-30"><ChevronRight size={19}/></span>}
          <Link href={calendarHref(query, { date: today, appointment: null })}
            className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-slate-50">اليوم</Link>
          {calendarDateInRange(forward, today) ?
            <Link aria-label="الفترة التالية" href={calendarHref(query, { date: forward, appointment: null })}
              className="rounded-xl border p-2.5 text-slate-700 hover:bg-slate-50"><ChevronLeft size={19}/></Link> :
            <span className="rounded-xl border p-2.5 opacity-30"><ChevronLeft size={19}/></span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-extrabold">
          {query.view === "day" ? fullDate(first) : `${fullDate(first)} — ${fullDate(last)}`}
        </p>
        <div className="flex flex-wrap gap-2" aria-label="فلترة الحالة">
          {statuses.map(item =>
            <Link key={item.value}
              href={calendarHref(query, { status: item.value, appointment: null })}
              aria-current={query.status === item.value ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${query.status === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {item.label}
            </Link>)}
        </div>
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-3" aria-label="ملخص الفترة والفلتر">
      <div className="dash-card"><p className="text-xs font-bold text-muted-foreground">عدد المواعيد الظاهرة</p><p className="mt-2 text-2xl font-black">{appointments.length}</p></div>
      <div className="dash-card"><p className="text-xs font-bold text-muted-foreground">بانتظار التأكيد</p><p className="mt-2 text-2xl font-black">{pending}</p></div>
      <div className="dash-card"><p className="text-xs font-bold text-muted-foreground">مؤكدة</p><p className="mt-2 text-2xl font-black">{confirmed}</p></div>
    </div>

    {selected && <section id="calendar-details" className="surface scroll-mt-24 space-y-4 p-5 sm:p-7" aria-label="تفاصيل الحجز المحدد">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">تفاصيل الحجز</h2>
          <p className="mt-1 text-xs text-muted-foreground">البيانات متاحة لموظفي العيادة المصرّح لهم فقط.</p>
        </div>
        <Link href={calendarHref(query, { appointment: null })}
          className="rounded-lg border p-2" aria-label="إغلاق تفاصيل الحجز"><X size={17}/></Link>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p className="flex gap-2"><UserRound size={16}/>{selected.patient_name ?? "بدون اسم"}</p>
        <p className="flex gap-2"><Phone size={16}/><bdi dir="ltr">{selected.patient_phone}</bdi></p>
        <p className="flex gap-2"><CalendarDays size={16}/>{fullDate(selected.appointment_date)}</p>
        <p className="flex gap-2"><Clock3 size={16}/><bdi dir="ltr">{hhmm(selected.start_time)}–{hhmm(selected.end_time)}</bdi></p>
        <p>الحالة: <strong>{statusNames[selected.status]}</strong></p>
        {selected.reason_for_visit && <p className="sm:col-span-2">ملاحظة: {selected.reason_for_visit}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t pt-4">
        <AppointmentActions appointmentId={selected.id} status={selected.status}
          canMarkVisit={role === "doctor"}/>
        {(selected.status === "pending" || selected.status === "confirmed") &&
          <Link href={`/dashboard/appointments/${selected.id}/reschedule`}
            className="inline-flex items-center gap-2 rounded-xl border border-teal-200 px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50">تغيير الموعد <ArrowUpLeft size={16}/></Link>}
      </div>
    </section>}

    {query.view === "week" ?
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <div className="grid min-w-[1120px] grid-cols-7 divide-x divide-x-reverse divide-slate-200" aria-label="تقويم الأسبوع">
          {days.map(day => {
            const visits = grouped.get(day) ?? [];
            const exceptions = blocksFor(day, blocked);
            return <section key={day} className={`min-h-72 p-3 ${day === today ? "bg-teal-50/60" : ""}`}>
              <div className="space-y-2 border-b pb-3">
                <Link href={calendarHref(query, { view: "day", date: day, appointment: null })}
                  className="block text-sm font-extrabold hover:text-teal-700">{dateLabel(day)}</Link>
                <p className="text-[11px] text-slate-500" dir="ltr">{scheduleLabel(day, availability)}</p>
                <p className="text-xs text-slate-500">{visits.length} حجز</p>
                {exceptions.map((b,i) =>
                  <p key={i} className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-800">
                    {b.is_full_day ? "اليوم مغلق" : `حظر ${hhmm(b.start_time ?? "")}–${hhmm(b.end_time ?? "")}`}
                    {b.reason ? ` — ${b.reason}` : ""}
                  </p>)}
              </div>
              <div className="mt-3 space-y-2">
                {visits.length ? visits.map(item =>
                  <AppointmentTile key={item.id} appointment={item} query={query} compact/>) :
                  <p className="py-5 text-center text-xs text-slate-400">لا توجد حجوزات</p>}
              </div>
            </section>;
          })}
        </div>
      </div> :
      <section className="surface space-y-5 p-5 sm:p-7" aria-label="تقويم اليوم">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">{dateLabel(first)}</h2>
          <span className="text-sm text-slate-500" dir="ltr">{scheduleLabel(first, availability)}</span>
        </div>
        {blocksFor(first, blocked).map((b,i) =>
          <p key={i} className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {b.is_full_day ? "اليوم مغلق" : `فترة مغلقة: ${hhmm(b.start_time ?? "")}–${hhmm(b.end_time ?? "")}`}
            {b.reason ? ` — ${b.reason}` : ""}
          </p>)}
        <div className="space-y-3">
          {(grouped.get(first) ?? []).length ?
            (grouped.get(first) ?? []).map(item =>
              <div key={item.id} className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)]">
                <div className="border-s-2 border-teal-200 p-3 text-sm font-extrabold" dir="ltr">{hhmm(item.start_time)}</div>
                <AppointmentTile appointment={item} query={query}/>
              </div>) :
            <div className="rounded-xl border border-dashed border-slate-200 p-12 text-center text-sm text-slate-500">مفيش حجوزات بنفس الفلتر في اليوم ده.</div>}
        </div>
      </section>}
    <p className="text-xs leading-6 text-slate-500">
      المواعيد المعروضة حسب توقيت القاهرة. ساعات العمل والفترات المغلقة للتوضيح فقط؛ قاعدة البيانات بتتحقق من صلاحية الحجز وتمنع التعارض عند الحفظ.
    </p>
  </div>;
}
