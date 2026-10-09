import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { isAuthorizedDoctor } from "@/lib/auth/doctor-access";
import { redirect } from "next/navigation";
import { CalendarDays, Clock3, ArrowUpLeft, ClipboardList, CalendarPlus2 } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
function todayDateString() { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const read = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`; }
export default async function DoctorDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAuthorizedDoctor(userId)) redirect("/doctor-access-denied");
  const today = todayDateString();
  const { data: appointments } = await createServiceClient().from("appointments").select("id, start_time, end_time, status, reason_for_visit, patients(name, phone)").eq("appointment_date", today).in("status", ["pending", "confirmed"]).order("start_time", { ascending: true });
  const pending = appointments?.filter(a => a.status === "pending").length ?? 0;
  return <div className="space-y-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><span className="eyebrow"><ClipboardList size={15}/> لوحة الطبيب</span><h1 className="mt-4 page-title">صباح التنظيم 👋</h1><p className="page-desc">ملخص المواعيد المجدولة لليوم في العيادة.</p></div><Link href="/dashboard/appointments" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white">عرض كل المواعيد <ArrowUpLeft size={17}/></Link></div>
  <div className="grid gap-4 sm:grid-cols-3"><div className="dash-card"><CalendarDays className="mb-3 text-teal-700"/><p className="text-xs font-bold text-muted-foreground">مواعيد اليوم</p><p className="mt-2 text-3xl font-black">{appointments?.length ?? 0}</p></div><div className="dash-card"><Clock3 className="mb-3 text-amber-600"/><p className="text-xs font-bold text-muted-foreground">بانتظار التأكيد</p><p className="mt-2 text-3xl font-black">{pending}</p></div><div className="dash-card"><CalendarPlus2 className="mb-3 text-emerald-600"/><p className="text-xs font-bold text-muted-foreground">مواعيد مؤكدة</p><p className="mt-2 text-3xl font-black">{(appointments?.length ?? 0) - pending}</p></div></div>
  <section className="surface p-6 sm:p-8"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-extrabold">جدول اليوم</h2><span className="text-xs text-muted-foreground" dir="ltr">{today}</span></div>{!appointments?.length ? <div className="rounded-2xl bg-slate-50 px-4 py-12 text-center"><CalendarDays className="mx-auto size-11 text-slate-300"/><p className="mt-3 font-bold">لا توجد مواعيد نشطة اليوم</p><p className="mt-1 text-sm text-muted-foreground">المواعيد القادمة ستظهر هنا.</p></div> : <ul className="space-y-3">{appointments.map(appt => <li key={appt.id} className="flex flex-wrap items-center gap-4 rounded-xl border bg-slate-50/60 p-4"><div className="grid size-13 place-items-center rounded-xl bg-white font-black text-teal-800" dir="ltr">{appt.start_time.slice(0,5)}</div><div className="min-w-0 flex-1"><p className="font-extrabold">{appt.patients?.name ?? "بدون اسم"}</p><p className="text-xs text-muted-foreground" dir="ltr">{appt.patients?.phone}</p>{appt.reason_for_visit && <p className="text-xs text-muted-foreground">{appt.reason_for_visit}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-bold ${appt.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{appt.status === "confirmed" ? "مؤكد" : "معلق"}</span></li>)}</ul>}</section></div>;
}
