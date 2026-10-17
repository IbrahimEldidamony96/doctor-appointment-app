import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { getAvailableSlots } from "@/lib/availability";
import { RescheduleForm } from "@/components/doctor/reschedule-form";

export const metadata = { title: "تغيير موعد الحجز" };

export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "appointments:reschedule")) {
    redirect("/doctor-access-denied");
  }
  const { appointmentId } = await params;
  if (!z.string().uuid().safeParse(appointmentId).success) notFound();
  const { data, error } = await createServiceClient().from("appointments")
    .select("id,appointment_date,start_time,end_time,status,patients(name,phone)")
    .eq("id", appointmentId).is("deleted_at", null).maybeSingle();

  if (error || !data) notFound();
  if (data.status !== "pending" && data.status !== "confirmed") {
    return <p className="status-error">الحجز ده مش قابل لتغيير الموعد لأنه اتقفل.</p>;
  }
  const slots = await getAvailableSlots(new Date());
  return <main className="space-y-6">
    <div>
      <h1 className="page-title">تغيير موعد الحجز</h1>
      <p className="page-desc">المريض: {data.patients?.name ?? "بدون اسم"} — <span dir="ltr">{data.patients?.phone}</span></p>
    </div>
    <RescheduleForm appointment={data} slots={slots}/>
  </main>;
}
