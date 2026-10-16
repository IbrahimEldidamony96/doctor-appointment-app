import { redirect } from "next/navigation";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import { getAvailableSlots } from "@/lib/availability";
import { ManualBookingForm } from "@/components/doctor/manual-booking-form";

export const metadata = { title: "حجز يدوي" };
export default async function ManualBookingPage() {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "appointments:create_manual")) {
    redirect("/doctor-access-denied");
  }
  const slots = await getAvailableSlots(new Date(), 14);
  return <section className="space-y-7">
    <div>
      <h1 className="page-title">تسجيل حجز يدوي</h1>
      <p className="page-desc">للمريض اللي اتصل أو جه العيادة: سجّل رقمه واختار ميعاد متاح.
        مش مطلوب من المريض OTP لأن الموظف المصرّح له هو اللي بيسجّل الحجز.</p>
    </div>
    <ManualBookingForm slots={slots}/>
  </section>;
}
