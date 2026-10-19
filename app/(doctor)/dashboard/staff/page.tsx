import { redirect } from "next/navigation";
import { requireClinicPermission } from "@/lib/auth/clinic-actor";
import { createServiceClient } from "@/lib/supabase/server";
import { StaffManager } from "@/components/doctor/staff-manager";

export const metadata = { title: "فريق العيادة" };
export default async function StaffPage() {
  const actor = await requireClinicPermission("staff:manage");
  if (!actor) redirect("/doctor-access-denied");
  const { data, error } = await createServiceClient().from("staff_accounts")
    .select("id,phone,display_name,role,is_active,is_owner,created_at").order("created_at", { ascending: false });
  if (error) return <p role="alert" className="status-error">تعذر تحميل حسابات فريق العيادة. حاول مرة أخرى.</p>;
  return <div className="space-y-7">
    <div><h1 className="page-title">فريق العيادة</h1>
      <p className="page-desc">إضافة الأطباء والتمريض والسكرتارية بأرقام الواتساب وتحديد صلاحياتهم.</p>
    </div>
    <StaffManager initialStaff={data ?? []} currentActorId={actor.id}/>
  </div>;
}
