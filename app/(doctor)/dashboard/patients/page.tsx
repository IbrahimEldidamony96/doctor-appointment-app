import { redirect } from "next/navigation";
import { searchClinicPatients } from "@/actions/staff-patients";
import { PatientSearch } from "@/components/doctor/patient-search";

export const metadata = { title: "إدارة المرضى" };
export const dynamic = "force-dynamic";

export default async function ClinicPatientsPage() {
  const initialResult = await searchClinicPatients({ query: "", page: 1 });
  if (!initialResult.success && initialResult.error === "forbidden") redirect("/doctor-access-denied");

  return <main className="space-y-6">
    <div>
      <h1 className="page-title">إدارة المرضى</h1>
      <p className="page-desc">كل المرضى المسجلين، مع البحث والتصفية والترتيب وتصفح سجل زيارات كل مريض.</p>
    </div>
    <PatientSearch initialResult={initialResult}/>
  </main>;
}
