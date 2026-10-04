import { redirect } from "next/navigation";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { createServiceClient } from "@/lib/supabase/server";
import { AppointmentCard } from "@/components/patient/appointment-card";

export default async function MyAppointmentsPage() {
  const session = await getPatientSession();
  if (!session) redirect("/login?redirect=/my-appointments");

  const supabase = createServiceClient();

  const { data: appointments } = await supabase
    .from("appointments")
    .select(
      "id, appointment_date, start_time, status, reason_for_visit, reviews(id, rating, comment), payments(status)"
    )
    .eq("patient_id", session.patientId)
    .order("appointment_date", { ascending: false })
    .order("start_time", { ascending: false });

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold">مواعيدي</h1>

      {(!appointments || appointments.length === 0) && (
        <p className="text-sm text-muted-foreground">مفيش مواعيد لسه</p>
      )}

      <ul className="space-y-3">
        {appointments?.map((appt) => (
          <AppointmentCard key={appt.id} appointment={appt} />
        ))}
      </ul>
    </main>
  );
}
