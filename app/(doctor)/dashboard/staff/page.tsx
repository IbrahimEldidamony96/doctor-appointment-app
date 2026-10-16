import { redirect } from "next/navigation";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { createServiceClient } from "@/lib/supabase/server";
import { StaffManager } from "@/components/doctor/staff-manager";

export const metadata = { title: "إدارة السكرتارية" };
export default async function StaffPage() {
  const actor = await getClinicActor();
  if (!actor || actor.role !== "doctor") redirect("/doctor-access-denied");
  const { data, error } = await createServiceClient().from("staff_accounts")
    .select("clerk_user_id,display_name,is_active,created_at").order("created_at", { ascending: false });
  if (error) return <p role="alert" className="status-error">مش قادر أحمل حسابات السكرتارية. تأكد من تشغيل migration المرحلة الثانية.</p>;
  return <div className="space-y-7">
    <div><h1 className="page-title">إدارة السكرتارية</h1>
      <p className="page-desc">إضافة أو تعطيل حسابات الاستقبال من غير مشاركة حساب الطبيب.</p>
    </div>
    <StaffManager initialStaff={data ?? []}/>
  </div>;
}
