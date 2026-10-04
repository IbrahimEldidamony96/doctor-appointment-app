"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cancelAppointment } from "@/actions/appointments";
import { submitReview } from "@/actions/reviews";
import { initiatePayment } from "@/actions/payments";

type Review = { id: string; rating: number; comment: string | null } | null;
type Payment = { status: string };

type Status = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";

type Appointment = {
  id: string;
  appointment_date: string;
  start_time: string;
  status: Status;
  reason_for_visit: string | null;
  reviews: Review;
  payments: Payment[] | null;
};

const statusLabels: Record<Status, string> = {
  pending: "معلق",
  confirmed: "مؤكد",
  cancelled: "ملغي",
  completed: "تمت",
  no_show: "لم يحضر",
};

export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const [status, setStatus] = useState(appointment.status);
  const [error, setError] = useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [review, setReview] = useState(appointment.reviews);
  const [isPending, startTransition] = useTransition();

  const isPaid = appointment.payments?.some((p) => p.status === "paid") ?? false;

  function handlePay() {
    setError(null);
    startTransition(async () => {
      const result = await initiatePayment({ appointmentId: appointment.id });
      if (result.success) {
        window.location.href = result.checkoutUrl;
        return;
      }
      const messages: Record<string, string> = {
        already_paid: "الموعد ده متدفوع خلاص",
        no_price_configured: "سعر الكشف لسه مش متحدد",
      };
      setError(messages[result.error] ?? "حصل خطأ، حاول تاني");
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAppointment({ appointmentId: appointment.id });
      if (result.success) {
        setStatus("cancelled");
        return;
      }
      const messages: Record<string, string> = {
        too_late_to_cancel: "الوقت متأخر للإلغاء دلوقتي",
        not_cancellable: "الموعد ده مش ممكن يتلغي",
      };
      setError(messages[result.error] ?? "حصل خطأ، حاول تاني");
    });
  }

  function handleSubmitReview() {
    setError(null);
    startTransition(async () => {
      const result = await submitReview({
        appointmentId: appointment.id,
        rating,
        comment: comment || undefined,
      });
      if (result.success) {
        setReview({ id: "temp", rating, comment: comment || null });
        setShowReviewForm(false);
        return;
      }
      setError("حصل خطأ في إرسال التقييم");
    });
  }

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {appointment.appointment_date} — {appointment.start_time.slice(0, 5)}
        </span>
        <span className="text-xs text-muted-foreground">{statusLabels[status]}</span>
      </div>

      {appointment.reason_for_visit && (
        <p className="mt-1 text-sm text-muted-foreground">{appointment.reason_for_visit}</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {(status === "pending" || status === "confirmed") && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleCancel}
          className="mt-2"
        >
          إلغاء الموعد
        </Button>
      )}

      {(status === "pending" || status === "confirmed") && !isPaid && (
        <Button size="sm" disabled={isPending} onClick={handlePay} className="mt-2 ms-2">
          ادفع الآن
        </Button>
      )}

      {isPaid && <p className="mt-2 text-xs text-green-600">تم الدفع ✅</p>}

      {status === "completed" && !review && !showReviewForm && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setShowReviewForm(true)}
          className="mt-2"
        >
          قيّم الزيارة
        </Button>
      )}

      {status === "completed" && showReviewForm && !review && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={n <= rating ? "text-lg" : "text-lg opacity-30"}
              >
                ⭐
              </button>
            ))}
          </div>
          <Textarea
            placeholder="تعليق (اختياري)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button size="sm" disabled={isPending} onClick={handleSubmitReview}>
            إرسال التقييم
          </Button>
        </div>
      )}

      {review && (
        <p className="mt-2 text-sm">
          تقييمك: {"⭐".repeat(review.rating)}
          {review.comment && ` — ${review.comment}`}
        </p>
      )}
    </li>
  );
}
