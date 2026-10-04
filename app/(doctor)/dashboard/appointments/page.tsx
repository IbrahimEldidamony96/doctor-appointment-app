import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { AppointmentActions } from "@/components/doctor/appointment-actions";

const statusLabels: Record<string, string> = {
  pending: "معلق",
  confirmed: "مؤكد",
  cancelled: "ملغي",
  completed: "تمت",
  no_show: "لم يحضر",
};

export default async function DoctorAppointmentsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createServiceClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: appointments } = await supabase
    .from("appointments")
    .select(
      "id, appointment_date, start_time, status, reason_for_visit, patients(name, phone)"
    )
    .gte("appointment_date", todayStr)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">كل المواعيد</h1>

      {(!appointments || appointments.length === 0) && (
        <p className="text-sm text-muted-foreground">مفيش مواعيد قادمة</p>
      )}

      <ul className="space-y-3">
        {appointments?.map((appt) => (
          <li key={appt.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {appt.appointment_date} — {appt.start_time.slice(0, 5)}
              </span>
              <span className="text-xs text-muted-foreground">
                {statusLabels[appt.status]}
              </span>
            </div>
            <p className="mt-1 text-sm">
              {appt.patients?.name ?? "بدون اسم"} — {appt.patients?.phone}
            </p>
            {appt.reason_for_visit && (
              <p className="mt-1 text-sm text-muted-foreground">
                {appt.reason_for_visit}
              </p>
            )}
            <div className="mt-2">
              <AppointmentActions appointmentId={appt.id} status={appt.status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
