import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "clinic@example.com";

// Email is optional for patients (they sign up with phone only), so
// every function here silently no-ops if there's no address on file
// rather than failing the whole booking/status-update flow.

export async function sendBookingReceivedEmail(
  to: string | null,
  patientName: string | null,
  date: string,
  time: string
) {
  if (!to) return;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "تم استلام طلب الحجز",
    html: `<p>مرحبًا ${patientName ?? ""}،</p><p>استلمنا طلب حجزك يوم ${date} الساعة ${time}. هنبعتلك تأكيد لما الدكتور يراجعه.</p>`,
  });
}

export async function sendAppointmentConfirmedEmail(
  to: string | null,
  patientName: string | null,
  date: string,
  time: string
) {
  if (!to) return;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "تم تأكيد موعدك",
    html: `<p>مرحبًا ${patientName ?? ""}،</p><p>تم تأكيد موعدك يوم ${date} الساعة ${time}.</p>`,
  });
}

export async function sendAppointmentCancelledEmail(
  to: string | null,
  patientName: string | null,
  date: string,
  time: string
) {
  if (!to) return;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "تم إلغاء الموعد",
    html: `<p>مرحبًا ${patientName ?? ""}،</p><p>تم إلغاء موعدك يوم ${date} الساعة ${time}.</p>`,
  });
}
