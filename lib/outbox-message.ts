/** Pure, testable renderer. No recipient may supply HTML or template selectors. */
export type OutboxEvent = "booked" | "confirmed" | "cancelled" | "rescheduled";
export type OutboxPayload = {
  name: string; date: string; time: string; status: string;
  previous_date: string | null; previous_time: string | null;
};
export function isOutboxEvent(value: string): value is OutboxEvent {
  return value === "booked" || value === "confirmed" ||
    value === "cancelled" || value === "rescheduled";
}
export function readOutboxPayload(value: unknown): OutboxPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.name !== "string" || typeof row.date !== "string" ||
    typeof row.time !== "string" || typeof row.status !== "string" ||
    (row.previous_date !== null && typeof row.previous_date !== "string") ||
    (row.previous_time !== null && typeof row.previous_time !== "string")) return null;
  return {
    name: row.name as string,
    date: row.date as string,
    time: row.time as string,
    status: row.status as string,
    previous_date: row.previous_date as string | null,
    previous_time: row.previous_time as string | null,
  };
}
const entities: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
function safe(value: string): string {
  return value.replace(/[&<>"']/g, char => entities[char] ?? char);
}
export function outboxEmail(event: OutboxEvent, p: OutboxPayload): {
  subject: string; html: string;
} {
  const subject = {
    booked: "تم استلام طلب الحجز",
    confirmed: "تم تأكيد موعدك",
    cancelled: "تم إلغاء موعدك",
    rescheduled: "تم تغيير موعد زيارتك",
  }[event];
  const content = {
    booked: "استلمنا طلب حجزك",
    confirmed: "تم تأكيد حجزك",
    cancelled: "تم إلغاء حجزك",
    rescheduled: "تم تغيير حجزك",
  }[event];
  const oldTime = event === "rescheduled" && p.previous_date && p.previous_time
    ? ` من ${p.previous_date} الساعة ${p.previous_time}` : "";
  return {
    subject,
    html: `<p>مرحبًا ${safe(p.name)}،</p><p>${content}${safe(oldTime)}. موعد الحجز: ${safe(p.date)} الساعة ${safe(p.time)}.</p>`,
  };
}
export function currentEventMatches(
  event: OutboxEvent,
  payload: OutboxPayload,
  appointment: { status: string; appointment_date: string; start_time: string; deleted_at: string | null } | null,
): boolean {
  if (!appointment || appointment.deleted_at !== null) return false;
  const latestSlot = appointment.appointment_date === payload.date &&
    appointment.start_time.slice(0, 5) === payload.time;
  return latestSlot && (
    (event === "booked" && appointment.status === "pending") ||
    (event === "confirmed" && appointment.status === "confirmed") ||
    (event === "cancelled" && appointment.status === "cancelled") ||
    (event === "rescheduled" && ["pending", "confirmed"].includes(appointment.status))
  );
}
