"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateAppointmentStatus } from "@/actions/doctor-appointments";

type Status = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";

type Props = {
  appointmentId: string;
  status: Status;
};

export function AppointmentActions({ appointmentId, status }: Props) {
  const [isPending, startTransition] = useTransition();

  function updateStatus(newStatus: "confirmed" | "cancelled" | "completed" | "no_show") {
    startTransition(() => {
      updateAppointmentStatus(appointmentId, newStatus);
    });
  }

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => updateStatus("confirmed")}>
          تأكيد
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => updateStatus("cancelled")}
        >
          إلغاء
        </Button>
      </div>
    );
  }

  if (status === "confirmed") {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => updateStatus("completed")}>
          تمت الزيارة
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => updateStatus("no_show")}
        >
          لم يحضر
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => updateStatus("cancelled")}
        >
          إلغاء
        </Button>
      </div>
    );
  }

  return null; // cancelled / completed / no_show — nothing left to do
}
