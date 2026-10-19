import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutPatient } from "@/actions/patient-auth";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { DashboardLogo, DashboardNav, DashboardViewSite } from "@/components/doctor/dashboard-nav";

export default async function DoctorDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await getClinicActor();
  if (!actor) {
    const session = await getPatientSession();
    redirect(session ? "/doctor-access-denied" : "/login?redirect=/dashboard");
  }
  return <div className="min-h-screen bg-[#f5f9fa]">
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-xl">
      <div className="container-app flex h-19 items-center justify-between gap-3">
        <DashboardLogo/>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs font-bold text-slate-500 sm:block">{actor.role === "doctor" ? "لوحة إدارة العيادة" : actor.role === "nurse" ? "فريق التمريض" : "مكتب الاستقبال"}</span>
          <DashboardViewSite/>
          <form action={logoutPatient}>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100" aria-label="تسجيل الخروج"><LogOut size={18}/><span className="hidden sm:inline">خروج</span></button>
          </form>
        </div>
      </div>
    </header>
    <div className="container-app grid gap-7 pb-16 pt-6 lg:grid-cols-[245px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-25 lg:self-start"><div className="surface-sm p-3 lg:p-4">
        <p className="hidden px-4 pb-3 text-xs font-bold text-muted-foreground lg:block">القائمة الرئيسية</p>
        <DashboardNav role={actor.role}/>
      </div></aside>
      <main className="min-w-0">{children}</main>
    </div>
  </div>;
}
