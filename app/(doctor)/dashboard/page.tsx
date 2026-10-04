import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DoctorDashboardPage() {
  const { userId } = await auth();
  // Defense in depth — middleware already protects /dashboard.
  if (!userId) redirect("/sign-in");

  const supabase = createServiceClient();
  const today = todayDateString();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, status, reason_for_visit, patients(name, phone)")
    .eq("appointment_date", today)
    .in("status", ["pending", "confirmed"])
    .order("start_time", { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">مواعيد النهاردة</h1>

      {(!appointments || appointments.length === 0) && (
        <p className="text-sm text-muted-foreground">مفيش مواعيد النهاردة</p>
      )}

      <ul className="space-y-3">
        {appointments?.map((appt) => (
          <li key={appt.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{appt.start_time.slice(0, 5)}</span>
              <span
                className={
                  appt.status === "confirmed"
                    ? "text-xs text-green-600"
                    : "text-xs text-amber-600"
                }
              >
                {appt.status === "confirmed" ? "مؤكد" : "معلق"}
              </span>
            </div>
            <p className="text-sm">
              {appt.patients?.name ?? "بدون اسم"} — {appt.patients?.phone}
            </p>
            {appt.reason_for_visit && (
              <p className="mt-1 text-sm text-muted-foreground">
                {appt.reason_for_visit}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
