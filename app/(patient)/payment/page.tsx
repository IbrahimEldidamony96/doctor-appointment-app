import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, ShieldCheck, ArrowUpLeft } from "lucide-react";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { createServiceClient } from "@/lib/supabase/server";
import { AppointmentCard } from "@/components/patient/appointment-card";
export const metadata = { title: "الدفع" };
export default async function PaymentPage() {
  const session = await getPatientSession();
  if (!session) redirect("/login?redirect=/payment");
  const { data: appointments } = await createServiceClient().from("appointments").select("id, appointment_date, start_time, status, reason_for_visit, reviews(id, rating, comment), payments(status)").eq("patient_id", session.patientId).in("status", ["pending", "confirmed"]).order("appointment_date", { ascending: false });
  return <main className="container-app max-w-4xl py-12 sm:py-16"><span className="eyebrow"><CreditCard size={15}/> الدفع الإلكتروني</span><h1 className="mt-4 page-title">دفع رسوم الحجز</h1><p className="page-desc">اختار حجزك وابدأ الدفع عبر بوابة الدفع الآمنة، لو العيادة مفعّلة الدفع الإلكتروني.</p><div className="mt-6 mb-8 flex gap-3 rounded-2xl bg-teal-50 p-5 text-sm leading-7 text-teal-900"><ShieldCheck className="shrink-0"/> حالة الدفع النهائية بتتحدث بعد تأكيد العملية من مزوّد الدفع؛ ما تعتمدش على الرجوع من صفحة الدفع وحده.</div>{!appointments?.length ? <div className="surface p-9 text-center"><p className="font-extrabold">مفيش حجوزات حالية قابلة للدفع.</p><Link href="/my-appointments" className="mt-4 inline-flex items-center gap-2 font-bold text-teal-700">عرض كل المواعيد <ArrowUpLeft size={16}/></Link></div> : <ul className="space-y-4">{appointments.map((appt) => <AppointmentCard key={appt.id} appointment={appt}/>)}</ul>}</main>;
}
