"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createAppointment } from "@/actions/appointments";
import { getAvailableSlotsAction } from "@/actions/availability";
import type { Slot } from "@/lib/availability";

type Props = {
  slots: Slot[];
  initialName: string;
};

export function BookingForm({ slots: initialSlots, initialName }: Props) {
  const [slots, setSlots] = useState(initialSlots);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialSlots[0]?.date ?? null
  );
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dates = useMemo(
    () => Array.from(new Set(slots.map((s) => s.date))),
    [slots]
  );

  const slotsForSelectedDate = useMemo(
    () => slots.filter((s) => s.date === selectedDate),
    [slots, selectedDate]
  );

  function handleSubmit() {
    if (!selectedSlot) {
      setError("اختار معاد الأول");
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await createAppointment({
        date: selectedSlot.date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reasonForVisit: reason || undefined,
        patientName: name || undefined,
        patientEmail: email || undefined,
      });

      if (result.success) {
        setSuccess(true);
        return;
      }

      if (result.error === "slot_taken") {
        setError("المعاد ده اتحجز قبلك بلحظات، اختار معاد تاني");
        const fresh = await getAvailableSlotsAction(new Date().toISOString());
        setSlots(fresh);
        setSelectedSlot(null);
        return;
      }

      if (result.error === "unauthenticated") {
        setError("الجلسة انتهت، سجل دخول تاني");
        return;
      }

      setError("حصل خطأ، حاول تاني");
    });
  }

  if (success) {
    return (
      <div className="rounded-lg border p-4 text-center">
        <p className="font-medium">تم حجز الموعد بنجاح ✅</p>
        <a href="/my-appointments" className="mt-2 inline-block text-sm underline">
          اعرض مواعيدي
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">اختار اليوم</Label>
        <div className="flex flex-wrap gap-2">
          {dates.map((date) => (
            <Button
              key={date}
              type="button"
              variant={date === selectedDate ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedDate(date);
                setSelectedSlot(null);
              }}
            >
              {date}
            </Button>
          ))}
        </div>
      </div>

      {selectedDate && (
        <div>
          <Label className="mb-2 block">اختار المعاد</Label>
          <div className="flex flex-wrap gap-2">
            {slotsForSelectedDate.map((slot) => (
              <Button
                key={slot.startTime}
                type="button"
                variant={
                  selectedSlot?.startTime === slot.startTime ? "default" : "outline"
                }
                size="sm"
                onClick={() => setSelectedSlot(slot)}
              >
                {slot.startTime}
              </Button>
            ))}
            {slotsForSelectedDate.length === 0 && (
              <p className="text-sm text-muted-foreground">
                مفيش معادات متاحة في اليوم ده
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="name" className="mb-2 block">
          الاسم
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسمك"
        />
      </div>

      <div>
        <Label htmlFor="email" className="mb-2 block">
          الإيميل (اختياري، لتأكيد الحجز)
        </Label>
        <Input
          id="email"
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <Label htmlFor="reason" className="mb-2 block">
          سبب الزيارة (اختياري)
        </Label>
        <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? "جاري الحجز..." : "احجز الموعد"}
      </Button>
    </div>
  );
}
