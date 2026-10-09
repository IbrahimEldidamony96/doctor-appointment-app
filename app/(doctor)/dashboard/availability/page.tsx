import { auth } from "@clerk/nextjs/server";
import { isAuthorizedDoctor } from "@/lib/auth/doctor-access";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { AvailabilityManager } from "@/components/doctor/availability-manager";

export default async function AvailabilityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAuthorizedDoctor(userId)) redirect("/doctor-access-denied");

  const supabase = createServiceClient();

  const [{ data: availability }, { data: blockedDates }] = await Promise.all([
    supabase.from("availability").select("*").order("day_of_week", { ascending: true }),
    supabase.from("blocked_dates").select("*").order("date", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="mb-7 page-title">أوقات العمل</h1>
      <div className="surface p-6 sm:p-8"><AvailabilityManager
        initialAvailability={availability ?? []}
        initialBlockedDates={blockedDates ?? []}
      /></div>
    </div>
  );
}
