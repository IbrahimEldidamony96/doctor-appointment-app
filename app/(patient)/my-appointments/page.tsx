import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Plus, CalendarX2 } from "lucide-react";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { createServiceClient } from "@/lib/supabase/server";
import { AppointmentCard } from "@/components/patient/appointment-card";
export const metadata = { title: "مواعيدي" };
export default async function MyAppointmentsPage() {
  const session = await getPatientSession();
  if (!session) redirect("/login?redirect=/my-appointments");
  const { data: appointments } = await createServiceClient().from("appointments").select("id, appointment_date, start_time, status, reason_for_visit, reviews(id, rating, comment), payments(status)").eq("patient_id", session.patientId).order("appointment_date", { ascending: false }).order("start_time", { ascending: false });
  return <main className="container-app max-w-4xl py-12 sm:py-16">
    <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><span className="eyebrow"><CalendarClock size={15}/> مساحة المريض</span><h1 className="mt-4 page-title">مواعيدي</h1><p className="page-desc">تابع كل زياراتك، وإدارة الحجز والدفع والتقييم من نفس الصفحة.</p></div><Link href="/book" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800"><Plus size={17}/> حجز جديد</Link></div>
    {!appointments?.length ? <div className="surface px-6 py-16 text-center"><CalendarX2 className="mx-auto size-16 text-teal-300"/><h2 className="mt-5 text-xl font-extrabold">لسه ماعندكش مواعيد</h2><p className="mt-2 text-sm text-muted-foreground">أول خطوة بسيطة: اختار اليوم والوقت المناسب لك.</p><Link href="/book" className="mt-6 inline-flex rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white">احجز أول موعد</Link></div> : <ul className="space-y-4">{appointments.map((appt) => <AppointmentCard key={appt.id} appointment={appt}/>)}</ul>}
  </main>;
}
