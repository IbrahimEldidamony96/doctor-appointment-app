import { redirect } from "next/navigation";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import { PatientSearch } from "@/components/doctor/patient-search";

export const metadata = { title: "إدارة المرضى" };
export const dynamic = "force-dynamic";

export default async function ClinicPatientsPage() {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "patients:search")) redirect("/doctor-access-denied");
  return <main className="space-y-6">
    <div>
      <h1 className="page-title">إدارة المرضى</h1>
      <p className="page-desc">ابحث عن مريض، شوف سجل زياراته، وتابع مواعيده من لوحة العيادة.</p>
    </div>
    <PatientSearch/>
  </main>;
}
