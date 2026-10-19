import { requireClinicPermission } from "@/lib/auth/clinic-actor";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/doctor/settings-form";

export default async function SettingsPage() {
  if (!await requireClinicPermission("settings:manage")) redirect("/doctor-access-denied");

  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("settings").select("*").maybeSingle();

  return (
    <div>
      <h1 className="mb-7 page-title">الإعدادات</h1>
      <div className="surface p-6 sm:p-8"><SettingsForm
        initial={{
          clinicName: settings?.clinic_name ?? "",
          bookingWindowDays: settings?.booking_window_days ?? 30,
          cancellationNoticeHours: settings?.cancellation_notice_hours ?? 24,
          defaultSlotMinutes: settings?.default_slot_minutes ?? 30,
          doctorNotificationPhone: settings?.doctor_notification_phone ?? "",
          consultationPrice: settings?.consultation_price ?? 0,
        }}
      /></div>
    </div>
  );
}
