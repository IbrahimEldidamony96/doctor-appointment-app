import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "clinic@example.com";

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

async function sendNotification(to: string | null, patientName: string | null, subject: string, message: string) {
  if (!to || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return;
  const name = escapeHtml(patientName ?? "");
  const safeMessage = escapeHtml(message);
  const result = await resend.emails.send({
    from: FROM_EMAIL, to, subject,
    html: `<p>مرحبًا ${name}،</p><p>${safeMessage}</p>`,
  });
  if (result.error) throw new Error("Email provider rejected message");
}

export async function sendBookingReceivedEmail(to: string | null, name: string | null, date: string, time: string) {
  return sendNotification(to, name, "تم استلام طلب الحجز",
    `استلمنا طلب حجزك يوم ${date} الساعة ${time}. هنبعتلك تأكيد لما الدكتور يراجعه.`);
}

export async function sendAppointmentConfirmedEmail(to: string | null, name: string | null, date: string, time: string) {
  return sendNotification(to, name, "تم تأكيد موعدك",
    `تم تأكيد موعدك يوم ${date} الساعة ${time}.`);
}

export async function sendAppointmentCancelledEmail(to: string | null, name: string | null, date: string, time: string) {
  return sendNotification(to, name, "تم إلغاء الموعد",
    `تم إلغاء موعدك يوم ${date} الساعة ${time}.`);
}

export async function sendAppointmentRescheduledEmail(
  to: string | null, name: string | null,
  previousDate: string, previousTime: string, date: string, time: string,
) {
  return sendNotification(to, name, "تم تغيير موعد زيارتك",
    `تم تغيير موعدك من ${previousDate} الساعة ${previousTime} إلى ${date} الساعة ${time}. لو التوقيت مش مناسب تواصل مع العيادة.`);
}
