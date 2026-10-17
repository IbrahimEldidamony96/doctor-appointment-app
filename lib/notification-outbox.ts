import "server-only";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import {
  currentEventMatches, isOutboxEvent, outboxEmail, readOutboxPayload,
} from "@/lib/outbox-message";

export type OutboxMetrics = {
  claimed: number; sent: number; failed: number; skipped: number; ackFailed: number;
};
const EMPTY = (): OutboxMetrics => ({ claimed: 0, sent: 0, failed: 0, skipped: 0, ackFailed: 0 });

/**
 * Process a bounded batch. Claim and ACK use PostgreSQL lease tokens.
 * Delivers at least once on transient acknowledgement errors. Resend idempotency
 * keys reduce duplicates within Resend's retention window (not exactly-once).
 */
export async function processNotificationOutbox(
  limit = 4, appointmentId?: string,
): Promise<OutboxMetrics> {
  const count = Math.max(1, Math.min(4, Math.floor(limit)));
  const db = createServiceClient();
  const { data: jobs, error } = await db.rpc("claim_notification_outbox", {
    p_limit: count, p_appointment_id: appointmentId ?? null,
  });
  if (error || !jobs) throw new Error("OUTBOX_CLAIM_FAILED");
  const metrics = EMPTY();
  metrics.claimed = jobs.length;

  for (const job of jobs) {
    const ack = async (result: "sent" | "retry" | "suppressed", providerId?: string) => {
      const response = await db.rpc("finish_notification_outbox", {
        p_id: job.id, p_claim_token: job.claim_token, p_result: result,
        p_provider_message_id: providerId ?? null,
        p_error: result === "retry" ? "provider_or_database_unavailable" : null,
      });
      return !response.error && response.data === true;
    };
    try {
      const payload = readOutboxPayload(job.payload);
      if (!payload || !isOutboxEvent(job.event_type)) {
        // Do not send unknown templates or badly formed data.
        if (await ack("suppressed")) metrics.skipped++;
        else metrics.ackFailed++;
        continue;
      }

      const { data: current, error: readError } = await db.from("appointments")
        .select("status,appointment_date,start_time,deleted_at")
        .eq("id", job.appointment_id).maybeSingle();
      if (readError) throw new Error("OUTBOX_APPOINTMENT_READ_FAILED");
      if (!currentEventMatches(job.event_type, payload, current)) {
        if (await ack("suppressed")) metrics.skipped++;
        else metrics.ackFailed++;
        continue;
      }

      // Missing env must FAIL, never silently mark an email delivered.
      if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
        throw new Error("OUTBOX_PROVIDER_NOT_CONFIGURED");
      }
      const email = outboxEmail(job.event_type, payload);
      const resend = new Resend(process.env.RESEND_API_KEY);
      const provider = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: job.destination_email,
        subject: email.subject,
        html: email.html,
      }, { idempotencyKey: "clinic-event/" + job.id });
      if (provider.error || !provider.data?.id) throw new Error("OUTBOX_PROVIDER_FAILED");
      if (await ack("sent", provider.data.id)) metrics.sent++;
      else metrics.ackFailed++;
    } catch {
      // Provider may have accepted the message before the timeout. Do not
      // fabricate success; replay uses the same provider idempotency key.
      if (await ack("retry").catch(() => false)) metrics.failed++;
      else metrics.ackFailed++;
    }
  }
  return metrics;
}

/** Never let a notification-provider outage turn a committed booking into failure. */
export async function tryDeliverAppointmentNotifications(appointmentId: string): Promise<void> {
  await processNotificationOutbox(2, appointmentId).catch(() => {});
}
