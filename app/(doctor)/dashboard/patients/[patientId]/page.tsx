import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArrowRight, CalendarDays, UserRound } from "lucide-react";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { parsePatientPage, VISIT_PAGE_SIZE } from "@/lib/patient-management";
import { PatientProfileEditor } from "@/components/doctor/patient-profile-editor";
import { PatientHistoryExport } from "@/components/doctor/patient-history-export";

export const metadata = { title: "سجل المريض" };
export const dynamic = "force-dynamic";

const statuses = {
  pending: "بانتظار التأكيد", confirmed: "مؤكد", cancelled: "ملغي",
  completed: "تمت الزيارة", no_show: "لم يحضر",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "UTC", dateStyle: "medium",
  }).format(new Date(value + "T12:00:00Z"));
}

export default async function ClinicPatientDetail({
  params, searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "patients:history"))
    redirect("/doctor-access-denied");

  const { patientId } = await params;
  if (!z.string().uuid().safeParse(patientId).success) notFound();
  const { page: rawPage } = await searchParams;
  const page = parsePatientPage(typeof rawPage === "string" ? rawPage : undefined);
  const offset = (page - 1) * VISIT_PAGE_SIZE;
  const db = createServiceClient();

  const patientResult = await db.from("patients")
    .select("id,name,phone,email,date_of_birth,gender,updated_at,created_at")
    .eq("id", patientId).is("deleted_at", null).maybeSingle();
  if (patientResult.error) {
    return <p role="alert" className="status-error">تعذر تحميل بيانات المريض.</p>;
  }
  const patient = patientResult.data;
  if (!patient) notFound();

  const visitsResult = await db.from("appointments")
    .select("id,appointment_date,start_time,end_time,status,reason_for_visit", { count: "exact" })
    .eq("patient_id", patientId).is("deleted_at", null)
    .order("appointment_date", { ascending: false })
    .order("start_time", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + VISIT_PAGE_SIZE - 1);

  if (visitsResult.error || visitsResult.count === null) {
    return <p role="alert" className="status-error">تعذر تحميل سجل الزيارات.</p>;
  }
  const visits = visitsResult.data ?? [];
  const totalPages = Math.ceil(visitsResult.count / VISIT_PAGE_SIZE);

  return <main className="space-y-7">
    <Link href="/dashboard/patients" className="inline-flex items-center gap-2 text-sm font-bold text-teal-700">
      <ArrowRight size={17}/> الرجوع للمرضى
    </Link>
    <section className="surface space-y-5 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><UserRound/></span>
        <div>
          <h1 className="text-2xl font-black">{patient.name ?? "بدون اسم"}</h1>
          <p className="mt-2 text-sm text-slate-600" dir="ltr">{patient.phone}</p>
        </div>
      </div>
      {actor.role === "doctor" && <dl className="grid gap-3 border-t pt-5 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">البريد الإلكتروني</dt><dd dir="ltr" className="mt-1 font-semibold">{patient.email ?? "غير مسجل"}</dd></div>
        <div><dt className="text-slate-500">تاريخ الميلاد</dt><dd className="mt-1 font-semibold">{patient.date_of_birth ?? "غير مسجل"}</dd></div>
        <div><dt className="text-slate-500">النوع</dt><dd className="mt-1 font-semibold">{patient.gender ?? "غير مسجل"}</dd></div>
        <div><dt className="text-slate-500">تاريخ إنشاء الحساب</dt><dd className="mt-1 font-semibold">{new Date(patient.created_at).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" })}</dd></div>
      </dl>}
    </section>

    {hasPermission(actor.role, "patients:manage") &&
      <PatientProfileEditor patientId={patient.id} name={patient.name ?? ""}
        email={patient.email ?? ""} updatedAt={patient.updated_at}/>}

    <section className="surface space-y-5 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold"><CalendarDays size={21}/> سجل المواعيد</h2>
          <p className="mt-2 text-xs text-slate-500">إجمالي المواعيد: {visitsResult.count}</p>
        </div>
        {hasPermission(actor.role, "patients:export") && <PatientHistoryExport patientId={patientId}/>}
      </div>
      {!visits.length ?
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">مفيش زيارات مسجلة في الصفحة دي.</p> :
        <ol className="space-y-3">
          {visits.map(visit => <li key={visit.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-extrabold">{formatDate(visit.appointment_date)} — <span dir="ltr">{visit.start_time.slice(0,5)}–{visit.end_time.slice(0,5)}</span></p>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{statuses[visit.status]}</span>
            </div>
            {actor.role === "doctor" && visit.reason_for_visit &&
              <p className="mt-3 text-sm text-slate-600">سبب الزيارة: {visit.reason_for_visit}</p>}
            {(visit.status === "pending" || visit.status === "confirmed") &&
              <Link href={"/dashboard/appointments/" + visit.id + "/reschedule"}
                className="mt-3 inline-block text-xs font-bold text-teal-700 hover:underline">تغيير الموعد</Link>}
          </li>)}
        </ol>}
      {totalPages > 1 && <nav aria-label="صفحات سجل الزيارات" className="flex items-center justify-between border-t pt-5 text-sm">
        {page > 1 ? <Link href={"?page=" + (page-1)} className="font-bold text-teal-700">الأحدث</Link> : <span/>}
        <span>صفحة {page} من {totalPages}</span>
        {page < totalPages && page < 1000 ? <Link href={"?page=" + (page+1)} className="font-bold text-teal-700">الأقدم</Link> : <span/>}
      </nav>}
    </section>
  </main>;
}
