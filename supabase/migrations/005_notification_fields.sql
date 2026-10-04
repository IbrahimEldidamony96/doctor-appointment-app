-- ============================================================
-- Migration: notification support fields
-- ============================================================
-- doctor_notification_phone: WhatsApp number to alert the doctor
--   about new bookings and patient-initiated cancellations.
-- reminder_sent_at: marks whether the cron reminder job already
--   messaged this appointment, so it isn't sent twice.
-- ============================================================

alter table clinic.settings add column doctor_notification_phone text;
alter table clinic.appointments add column reminder_sent_at timestamptz;
