import { redirect } from "next/navigation";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { getAvailableSlots } from "@/lib/availability";
import { createServiceClient } from "@/lib/supabase/server";
import { BookingForm } from "@/components/patient/booking-form";

export default async function BookPage() {
  const session = await getPatientSession();

  // Defense in depth — middleware already protects /book, but the
  // action/data layer shouldn't rely on that alone (same principle
  // used for RLS: real checks happen in server code).
  if (!session) {
    redirect("/login?redirect=/book");
  }

  const [slots, patientResult] = await Promise.all([
    getAvailableSlots(new Date()),
    createServiceClient()
      .from("patients")
      .select("name")
      .eq("id", session.patientId)
      .maybeSingle(),
  ]);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold">احجز موعد</h1>
      <BookingForm slots={slots} initialName={patientResult.data?.name ?? ""} />
    </main>
  );
}
