import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getClinicDateTime } from "@/lib/clinic-time";
import { AppointmentActions } from "@/components/doctor/appointment-actions";

const statusLabels: Record<string, string> = {
  pending: "معلق",
  confirmed: "مؤكد",
  cancelled: "ملغي",
  completed: "تمت",
  no_show: "لم يحضر",
};

export default async function DoctorAppointmentsPage() {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "appointments:view")) redirect("/doctor-access-denied");
  const canViewClinicalDetails = hasPermission(actor.role, "patients:manage");

  const supabase = createServiceClient();
  const todayStr = getClinicDateTime().date;

  const { data: appointments } = await supabase
    .from("appointments")
    .select(
      "id, appointment_date, start_time, status, reason_for_visit, patients(name, phone)"
    )
    .gte("appointment_date", todayStr)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="page-title">كل المواعيد</h1><Link href="/dashboard/appointments/new" className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800">+ حجز يدوي</Link></div>

      {(!appointments || appointments.length === 0) && (
        <p className="surface p-8 text-sm text-muted-foreground">مفيش مواعيد قادمة</p>
      )}

      <ul className="space-y-3">
        {appointments?.map((appt) => (
          <li key={appt.id} className="surface-sm p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {appt.appointment_date} — {appt.start_time.slice(0, 5)}
              </span>
              <span className="text-sm text-muted-foreground">
                {statusLabels[appt.status]}
              </span>
            </div>
            <p className="mt-1 text-sm">
              {appt.patients?.name ?? "بدون اسم"} — {appt.patients?.phone}
            </p>
            {canViewClinicalDetails && appt.reason_for_visit && (
              <p className="mt-1 text-sm text-muted-foreground">
                {appt.reason_for_visit}
              </p>
            )}
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-3">
                <AppointmentActions appointmentId={appt.id} status={appt.status} canMarkVisit={hasPermission(actor.role, "appointments:mark_visit")} />
                {(appt.status === "pending" || appt.status === "confirmed") &&
                  <Link href={`/dashboard/appointments/${appt.id}/reschedule`} className="rounded-lg border border-teal-200 px-4 py-2 text-xs font-bold text-teal-800 hover:bg-teal-50">تغيير الموعد</Link>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
