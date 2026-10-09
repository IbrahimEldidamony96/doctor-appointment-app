"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Clock3, CreditCard, MessageSquareHeart, XCircle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cancelAppointment } from "@/actions/appointments";
import { submitReview } from "@/actions/reviews";
import { initiatePayment } from "@/actions/payments";

type Review = { id: string; rating: number; comment: string | null } | null;
type Payment = { status: string };
type Status = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
type Appointment = { id: string; appointment_date: string; start_time: string; status: Status; reason_for_visit: string | null; reviews: Review; payments: Payment[] | null };
const labels: Record<Status, string> = { pending: "بانتظار التأكيد", confirmed: "مؤكد", cancelled: "ملغي", completed: "مكتمل", no_show: "لم يحضر" };
const statusColors: Record<Status, string> = { pending: "bg-amber-50 text-amber-700", confirmed: "bg-emerald-50 text-emerald-700", cancelled: "bg-red-50 text-red-700", completed: "bg-teal-50 text-teal-700", no_show: "bg-slate-100 text-slate-700" };
function formatDate(date: string) { return new Intl.DateTimeFormat("ar-EG", { dateStyle: "full", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z")); }

export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const [status, setStatus] = useState(appointment.status);
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [review, setReview] = useState(appointment.reviews);
  const [isPending, startTransition] = useTransition();
  const isPaid = appointment.payments?.some(p => p.status === "paid") ?? false;

  function handlePay() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await initiatePayment({ appointmentId: appointment.id });
        if (result.success) { window.location.assign(result.checkoutUrl); return; }
        const messages: Record<string,string> = { already_paid: "تم دفع قيمة الكشف بالفعل.", no_price_configured: "الدفع الإلكتروني غير متاح قبل تحديد سعر الكشف.", not_your_appointment: "غير مصرح بعرض هذا الموعد." };
        setError(messages[result.error] ?? "تعذر بدء الدفع الآن.");
      } catch { setError("تعذر الاتصال بخدمة الدفع حاليًا."); }
    });
  }
  function handleCancel() {
    if (!window.confirm("هل تريد إلغاء هذا الموعد؟")) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelAppointment({ appointmentId: appointment.id });
        if (result.success) { setStatus("cancelled"); return; }
        const messages: Record<string,string> = { too_late_to_cancel: "انتهت مهلة إلغاء هذا الموعد.", not_cancellable: "لا يمكن إلغاء هذا الموعد حاليًا." };
        setError(messages[result.error] ?? "تعذر إلغاء الموعد.");
      } catch { setError("تعذر الاتصال بالسيرفر."); }
    });
  }
  function handleReview() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitReview({ appointmentId: appointment.id, rating, comment: comment.trim() || undefined });
        if (result.success) { setReview({ id: "new-review", rating, comment: comment.trim() || null }); setShowReview(false); return; }
        setError("تعذر إرسال التقييم.");
      } catch { setError("حدث خطأ أثناء إرسال التقييم."); }
    });
  }
  return <li className="surface-sm overflow-hidden p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-muted-foreground">موعد زيارة</p><h3 className="mt-2 flex items-center gap-2 text-lg font-extrabold"><CalendarDays className="text-teal-700" size={20}/>{formatDate(appointment.appointment_date)}</h3><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 size={17}/> الساعة <span dir="ltr">{appointment.start_time.slice(0,5)}</span></p></div><span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${statusColors[status]}`}>{labels[status]}</span></div>
    {appointment.reason_for_visit && <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600"><b>سبب الزيارة:</b> {appointment.reason_for_visit}</p>}
    {error && <p className="status-error mt-4" role="alert">{error}</p>}
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-5">
      {(status === "pending" || status === "confirmed") && !isPaid && <Button size="sm" onClick={handlePay} disabled={isPending}><CreditCard/> ادفع الآن</Button>}
      {(status === "pending" || status === "confirmed") && <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}><XCircle/> إلغاء الحجز</Button>}
      {isPaid && <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">تم دفع رسوم الكشف ✓</span>}
      {status === "completed" && !review && !showReview && <Button size="sm" variant="outline" onClick={() => setShowReview(true)}><MessageSquareHeart/> قيّم الزيارة</Button>}
      {review && <span className="text-sm text-amber-600">تقييمك: {"★".repeat(review.rating)} {review.comment && `— ${review.comment}`}</span>}
    </div>
    {status === "completed" && showReview && !review && <div className="mt-5 space-y-4 rounded-xl bg-slate-50 p-5"><label className="block text-sm font-bold">تقييم تجربتك</label><div className="flex gap-1" role="group" aria-label="اختر عدد النجوم">{[1,2,3,4,5].map(n => <button type="button" key={n} aria-label={`${n} نجوم`} aria-pressed={rating === n} onClick={() => setRating(n)} className="rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-teal-400"><Star size={28} className={n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}/></button>)}</div><Textarea maxLength={1000} placeholder="اكتب رأيك (اختياري)" value={comment} onChange={e => setComment(e.target.value)}/><div className="flex gap-2"><Button size="sm" disabled={isPending} onClick={handleReview}>إرسال التقييم</Button><Button size="sm" variant="ghost" onClick={() => setShowReview(false)}>تراجع</Button></div></div>}
  </li>;
}
