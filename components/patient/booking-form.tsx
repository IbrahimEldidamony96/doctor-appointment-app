"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { CalendarCheck2, CalendarDays, CheckCircle2, Clock3, ArrowUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createAppointment } from "@/actions/appointments";
import { getAvailableSlotsAction } from "@/actions/availability";
import type { Slot } from "@/lib/availability";

type Props = { slots: Slot[]; initialName: string };
function formatDay(date: string) {
  return new Intl.DateTimeFormat("ar-EG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function BookingForm({ slots: initialSlots, initialName }: Props) {
  const [slots, setSlots] = useState(initialSlots);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSlots[0]?.date ?? null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dates = useMemo(() => [...new Set(slots.map(s => s.date))], [slots]);
  const todaysSlots = useMemo(() => slots.filter(s => s.date === selectedDate), [slots, selectedDate]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedSlot) { setError("اختار اليوم والساعة أولاً."); return; }
    if (name.trim().length < 2) { setError("اكتب اسمك الكامل (حرفين على الأقل)."); return; }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createAppointment({
          date: selectedSlot.date, startTime: selectedSlot.startTime, endTime: selectedSlot.endTime,
          reasonForVisit: reason.trim() || undefined, patientName: name.trim(), patientEmail: email.trim() || undefined,
        });
        if (result.success) { setSuccess(true); return; }
        if (result.error === "slot_taken") {
          setError("الموعد اتحجز قبل ما تكمل. اختار موعد تاني.");
          const fresh = await getAvailableSlotsAction(new Date().toISOString());
          setSlots(fresh); setSelectedSlot(null); setSelectedDate(fresh[0]?.date ?? null); return;
        }
        setError(result.error === "unauthenticated" ? "انتهت جلستك، سجّل دخول مرة تانية." : result.error === "invalid_input" ? "راجع بيانات الحجز وحاول مرة أخرى." : "تعذر إكمال الحجز حاليًا، حاول مرة أخرى.");
      } catch { setError("تعذر الاتصال بالسيرفر، حاول مرة أخرى."); }
    });
  }
  if (success) return <div role="status" className="py-10 text-center"><div className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={42}/></div><h2 className="mt-6 text-2xl font-black">تم إرسال طلب الحجز بنجاح!</h2><p className="mx-auto mt-3 max-w-md text-sm leading-8 text-muted-foreground">تقدر تتابع حالة الموعد من صفحة مواعيدي. شكرًا لاختيارك موعد.</p><Link href="/my-appointments" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 font-bold text-white">عرض مواعيدي <ArrowUpLeft size={17}/></Link></div>;

  return <form onSubmit={handleSubmit} className="space-y-8">
    <section><div className="mb-4 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><CalendarDays size={20}/></div><div><h2 className="font-extrabold">1. اختار اليوم المناسب</h2><p className="text-xs text-muted-foreground">الأيام المتاحة للحجز</p></div></div>
      {dates.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{dates.map(date => <button type="button" key={date} aria-pressed={date === selectedDate} onClick={() => {setSelectedDate(date); setSelectedSlot(null); setError(null);}} className={`min-h-16 rounded-xl border px-3 py-3 text-sm font-bold transition-all ${date === selectedDate ? "border-teal-700 bg-teal-700 text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"}`}>{formatDay(date)}</button>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center text-sm text-slate-500">لا توجد مواعيد متاحة حاليًا. جرّب مرة تانية قريبًا.</div>}
    </section>
    <section><div className="mb-4 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><Clock3 size={20}/></div><div><h2 className="font-extrabold">2. اختار الساعة</h2><p className="text-xs text-muted-foreground">المواعيد المتاحة في اليوم اللي اخترته</p></div></div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">{todaysSlots.map(slot => <button type="button" key={`${slot.date}-${slot.startTime}`} aria-pressed={selectedSlot?.date === slot.date && selectedSlot?.startTime === slot.startTime} onClick={() => {setSelectedSlot(slot);setError(null);}} className={`rounded-xl border px-2 py-3 text-sm font-bold transition ${selectedSlot?.date === slot.date && selectedSlot?.startTime === slot.startTime ? "border-teal-700 bg-teal-50 text-teal-800 ring-2 ring-teal-600" : "border-slate-200 bg-white text-slate-700 hover:border-teal-400"}`} dir="ltr">{slot.startTime}</button>)}</div>
      {dates.length > 0 && todaysSlots.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">مفيش مواعيد متاحة في اليوم ده.</p>}
    </section>
    <section className="border-t pt-7"><div className="mb-5 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><CalendarCheck2 size={20}/></div><div><h2 className="font-extrabold">3. بيانات الحجز</h2><p className="text-xs text-muted-foreground">كمّل بياناتك علشان نأكد طلبك</p></div></div>
      <div className="grid gap-5 sm:grid-cols-2"><div><Label htmlFor="booking-name" className="field-label">اسم المريض <span className="text-red-500">*</span></Label><Input id="booking-name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="الاسم الكامل"/></div><div><Label htmlFor="booking-email" className="field-label">البريد الإلكتروني (اختياري)</Label><Input id="booking-email" type="email" autoComplete="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></div></div>
      <div className="mt-5"><Label htmlFor="booking-reason" className="field-label">سبب الزيارة (اختياري)</Label><Textarea id="booking-reason" maxLength={500} placeholder="اكتب ملاحظة مختصرة تساعد العيادة..." value={reason} onChange={e => setReason(e.target.value)}/></div>
    </section>
    {selectedSlot && <div className="rounded-xl border border-teal-100 bg-teal-50 px-5 py-4 text-sm text-teal-900"><b>الموعد المختار:</b> {formatDay(selectedSlot.date)} — <span dir="ltr" className="inline-block">{selectedSlot.startTime}</span></div>}
    {error && <div className="status-error" role="alert">{error}</div>}
    <Button size="lg" type="submit" disabled={isPending || !selectedSlot} className="w-full">{isPending ? "جاري تأكيد الحجز..." : "تأكيد طلب الحجز"}<ArrowUpLeft size={19}/></Button>
  </form>;
}
