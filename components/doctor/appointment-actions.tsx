"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateAppointmentStatus } from "@/actions/doctor-appointments";

type Status = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
type NextStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export function AppointmentActions({ appointmentId, status }: { appointmentId: string; status: Status }) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState<Status>(status);
  const [error, setError] = useState<string | null>(null);

  function change(next: NextStatus) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateAppointmentStatus(appointmentId, next);
        if (result.success) {
          setCurrent(next);
          return;
        }
        setError(result.error === "invalid_transition"
          ? "حالة الموعد اتغيرت أو لسه ما بدأش. حدّث الصفحة وحاول تاني."
          : result.error === "unauthenticated" ? "انتهت صلاحية دخول الطبيب." : "تعذر تحديث الموعد.");
      } catch { setError("تعذر الاتصال بالخادم."); }
    });
  }

  return <div className="space-y-2">
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {current === "pending" && <>
        <Button size="sm" disabled={isPending} onClick={() => change("confirmed")}>تأكيد</Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => change("cancelled")}>إلغاء</Button>
      </>}
      {current === "confirmed" && <>
        <Button size="sm" disabled={isPending} onClick={() => change("completed")}>تمت الزيارة</Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => change("no_show")}>لم يحضر</Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => change("cancelled")}>إلغاء</Button>
      </>}
    </div>
  </div>;
}
