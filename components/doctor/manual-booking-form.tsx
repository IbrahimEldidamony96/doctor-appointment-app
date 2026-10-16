"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { createManualBooking } from "@/actions/manual-bookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Slot } from "@/lib/availability";

const errors: Record<string, string> = {
  forbidden: "الحساب مش مصرح له بحجز مواعيد للعيادة.",
  invalid_input: "بيانات المريض أو الموعد غير صحيحة.",
  slot_taken: "الموعد ده اتحجز بالفعل. حدّث الصفحة واختار موعد مختلف.",
  patient_inactive: "رقم المريض مرتبط بحساب محذوف. راجع إدارة العيادة.",
  unknown: "تعذر الحجز حاليًا. جرّب مرة تانية.",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}

export function ManualBookingForm({ slots }: { slots: Slot[] }) {
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState<string>(slots[0]?.date ?? "");
  const [selected, setSelected] = useState<Slot | null>(null);
  const [resultId, setResultId] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const dates = useMemo(() => [...new Set(slots.map(slot => slot.date))], [slots]);
  const times = useMemo(() => slots.filter(slot => slot.date === date), [slots, date]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) { setError("اختار يوم ووقت مناسب."); return; }
    setError("");
    startTransition(async () => {
      try {
        const response = await createManualBooking({
          patientName: patientName.trim(), phone: phone.trim(),
          date: selected.date, startTime: selected.startTime,
          endTime: selected.endTime, reason: reason.trim() || undefined,
        });
        if (response.success) { setResultId(response.appointmentId); return; }
        setError(errors[response.error] ?? "تعذر إتمام الحجز.");
      } catch { setError("تعذر الاتصال بالخادم."); }
    });
  }

  if (resultId) return <section className="surface p-10 text-center">
    <h2 className="text-xl font-extrabold text-teal-800">تم تسجيل طلب الحجز اليدوي</h2>
    <p className="mt-3 text-sm text-slate-600">الطلب اتسجل كمعلّق في جدول العيادة لحد التأكيد.</p>
    <Link href="/dashboard/appointments" className="mt-6 inline-flex rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white">
      الرجوع للمواعيد
    </Link>
  </section>;

  return <form onSubmit={submit} className="surface space-y-6 p-6 sm:p-9">
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="manual-patient-name">اسم المريض</Label>
        <Input id="manual-patient-name" required minLength={2} maxLength={100}
          value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="الاسم الكامل"/>
      </div>
      <div className="space-y-2">
        <Label htmlFor="manual-patient-phone">رقم واتساب أو الموبايل الدولي</Label>
        <Input id="manual-patient-phone" required type="tel" dir="ltr" autoComplete="tel"
          placeholder="+201XXXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)}/>
      </div>
    </div>
    <div>
      <h2 className="mb-3 font-extrabold">اختار اليوم</h2>
      {!dates.length ? <p className="text-sm text-slate-500">مفيش مواعيد متاحة خلال الأسبوعين الجايين.</p> :
        <div className="flex flex-wrap gap-2">{dates.map(value =>
          <Button type="button" key={value} variant={date === value ? "default" : "outline"} size="sm"
            onClick={() => { setDate(value); setSelected(null); setError(""); }}>
            {formatDate(value)}
          </Button>)}</div>}
    </div>
    <div>
      <h2 className="mb-3 font-extrabold">اختار الساعة</h2>
      <div className="flex flex-wrap gap-2">{times.map(slot =>
        <Button type="button" key={slot.date + slot.startTime}
          variant={selected?.startTime === slot.startTime ? "default" : "outline"} size="sm"
          onClick={() => { setSelected(slot); setError(""); }}>
          <span dir="ltr">{slot.startTime}</span>
        </Button>)}</div>
    </div>
    <div className="space-y-2">
      <Label htmlFor="manual-reason">سبب الزيارة (اختياري)</Label>
      <Textarea id="manual-reason" maxLength={500} value={reason} onChange={e => setReason(e.target.value)}/>
    </div>
    {selected && <p className="rounded-xl bg-teal-50 p-4 text-sm">الموعد: {formatDate(selected.date)} الساعة <span dir="ltr">{selected.startTime}</span></p>}
    {error && <p className="status-error" role="alert">{error}</p>}
    <Button type="submit" disabled={isPending || !selected}>
      {isPending ? "جاري الحجز..." : "تسجيل الحجز اليدوي"}
    </Button>
  </form>;
}
