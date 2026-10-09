import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { createServiceClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/patient/profile-form";
export const metadata = { title: "الملف الشخصي" };
export default async function ProfilePage() {
  const session = await getPatientSession();
  if (!session) redirect("/login?redirect=/profile");
  const { data: patient } = await createServiceClient().from("patients").select("name, email, phone").eq("id", session.patientId).maybeSingle();
  if (!patient) redirect("/login?redirect=/profile");
  return <main className="container-app max-w-3xl py-12 sm:py-16"><span className="eyebrow"><UserRound size={15}/> حسابي</span><h1 className="mt-4 page-title">بياناتي الشخصية</h1><p className="page-desc mb-8">حدّث اسمك وبريدك لتسهيل تأكيد الحجوزات والتواصل معك.</p><ProfileForm initialName={patient.name ?? ""} initialEmail={patient.email ?? ""} phone={patient.phone}/></main>;
}
