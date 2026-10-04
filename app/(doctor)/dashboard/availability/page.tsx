import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { AvailabilityManager } from "@/components/doctor/availability-manager";

export default async function AvailabilityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createServiceClient();

  const [{ data: availability }, { data: blockedDates }] = await Promise.all([
    supabase.from("availability").select("*").order("day_of_week", { ascending: true }),
    supabase.from("blocked_dates").select("*").order("date", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">أوقات العمل</h1>
      <AvailabilityManager
        initialAvailability={availability ?? []}
        initialBlockedDates={blockedDates ?? []}
      />
    </div>
  );
}
