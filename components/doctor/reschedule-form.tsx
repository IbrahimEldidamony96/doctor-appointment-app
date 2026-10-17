"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Slot } from "@/lib/availability";
import { rescheduleAppointment } from "@/actions/reschedule-appointments";

type Appointment = {
  id: string; appointment_date: string; start_time: string; end_time: string;
  status: "pending" | "confirmed";
};

const messages: Record<string, string> = {
  forbidden: "معندكش صلاحية تعديل المواعيد. اتواصل مع الطبيب.",
  invalid_input: "الموعد المختار غير صالح أو بقى خارج أوقات العمل.",
  not_found: "الحجز مش موجود أو اتحذف.",
  not_reschedulable: "الموعد انتهى أو حالته اتغيرت ومش قابل للنقل.",
  stale: "في حد غيّر الموعد من شاشة تانية. حدّث الصفحة وشوف الموعد الجديد قبل التعديل.",
  same_slot: "اختار موعد مختلف عن القديم.",
  slot_taken: "الموعد اتحجز أو اتقفل بالفعل. حدّث الصفحة واختار معاد تاني.",
  payment_in_progress: "في عملية دفع معلقة للحجز. لازم تتسوى الأول قبل تغيير الموعد.",
  unknown: "تعذر نقل الموعد. حاول بعد شوية.",
};

function displayDate(date: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

export function RescheduleForm({ appointment, slots }: { appointment: Appointment; slots: Slot[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Slot | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const dates = [...new Set(slots.map(slot => slot.date))];
  const [date, setDate] = useState(dates[0] ?? "");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) { setError("اختار يوم ووقت جديد."); return; }
    setError("");
    startTransition(async () => {
      try {
        const response = await rescheduleAppointment({
          appointmentId: appointment.id,
          expectedDate: appointment.appointment_date,
          expectedStartTime: appointment.start_time.slice(0, 5),
          expectedEndTime: appointment.end_time.slice(0, 5),
          date: selected.date, startTime: selected.startTime, endTime: selected.endTime,
        });
        if (!response.success) { setError(messages[response.error]); return; }
        setSuccess(true);
        router.refresh();
      } catch {
        setError("حصل خطأ في الاتصال بالسيرفر.");
      }
    });
  }

  if (success) return <div className="surface space-y-5 p-8 text-center" role="status">
    <h2 className="text-xl font-extrabold text-teal-800">تم تغيير الموعد بنجاح</h2>
    <p className="text-sm text-slate-600">الميعاد الجديد اتحفظ وسجل التعديل اتوثّق.</p>
    <Link href="/dashboard/appointments" className="inline-flex rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white">عرض كل المواعيد</Link>
  </div>;

  return <form onSubmit={onSubmit} className="surface space-y-7 p-6 sm:p-9">
    <div className="rounded-xl bg-slate-50 p-5">
      <p className="text-xs font-bold text-slate-500">الموعد الحالي</p>
      <p className="mt-2 font-extrabold">{displayDate(appointment.appointment_date)} — <span dir="ltr">{appointment.start_time.slice(0, 5)}</span></p>
      <p className="mt-2 text-xs text-slate-500">هتفضل حالة الحجز {appointment.status === "confirmed" ? "مؤكد" : "بانتظار التأكيد"} بعد النقل.</p>
    </div>
    <section>
      <h2 className="mb-3 font-extrabold">1. اختار يوم جديد</h2>
      {!dates.length ? <p className="text-sm text-slate-500">مفيش مواعيد متاحة حاليًا.</p> :
        <div className="flex flex-wrap gap-2">{dates.map(day =>
          <Button key={day} type="button" size="sm" variant={date === day ? "default" : "outline"}
            onClick={() => { setDate(day); setSelected(null); setError(""); }}>
            {displayDate(day)}
          </Button>)}</div>}
    </section>
    <section>
      <h2 className="mb-3 font-extrabold">2. اختار الساعة</h2>
      <div className="flex flex-wrap gap-2">{slots.filter(slot => slot.date === date).map(slot =>
        <Button key={slot.date + slot.startTime} type="button" size="sm"
          variant={selected?.date === slot.date && selected.startTime === slot.startTime ? "default" : "outline"}
          onClick={() => { setSelected(slot); setError(""); }}>
          <span dir="ltr">{slot.startTime}</span>
        </Button>)}</div>
    </section>
    {selected && <p className="rounded-xl bg-teal-50 p-4 text-sm">
      الميعاد الجديد: {displayDate(selected.date)} — <span dir="ltr">{selected.startTime}</span>
    </p>}
    {error && <div role="alert" className="status-error">{error} <Link href="/dashboard/appointments" className="underline">الرجوع للمواعيد</Link></div>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending || !selected}>{pending ? "جاري نقل الموعد..." : "تأكيد تغيير الموعد"}</Button>
      <Link href="/dashboard/appointments" className="rounded-xl border px-5 py-3 text-sm font-bold">إلغاء</Link>
    </div>
  </form>;
}
