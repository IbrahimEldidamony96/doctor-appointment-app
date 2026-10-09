/** Clinic schema contract. Keep synchronized with supabase/migrations. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
type Table<Row, Required extends keyof Row = never, Relationships extends Relation[] = []> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: Relationships;
};
type Relation = { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] };
type Patient = {
  id: string; phone: string; name: string | null; email: string | null;
  date_of_birth: string | null; gender: string | null; created_at: string;
  updated_at: string; deleted_at: string | null;
};
type Appointment = {
  id: string; patient_id: string; appointment_date: string; start_time: string; end_time: string;
  status: AppointmentStatus; reason_for_visit: string | null; notes: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
  reminder_sent_at: string | null; reminder_claimed_at: string | null; reminder_claim_token: string | null;
};
type Payment = {
  id: string; appointment_id: string; amount: number; currency: string; provider: string;
  status: PaymentStatus; transaction_id: string | null; paid_at: string | null; created_at: string;
  intention_id: string | null; provider_order_id: string | null; checkout_url: string | null;
};
type Review = {
  id: string; appointment_id: string; patient_id: string; rating: number;
  comment: string | null; is_published: boolean; created_at: string;
};
type Settings = {
  id: string; clinic_name: string; booking_window_days: number; cancellation_notice_hours: number;
  default_slot_minutes: number; updated_at: string; consultation_price: number | null;
  doctor_notification_phone: string | null;
};
export type Database = {
  clinic: {
    Tables: {
      patients: Table<Patient, "phone">;
      availability: Table<{ id: string; day_of_week: number; start_time: string; end_time: string; slot_duration_minutes: number; is_active: boolean; created_at: string }, "day_of_week" | "start_time" | "end_time">;
      blocked_dates: Table<{ id: string; date: string; is_full_day: boolean; start_time: string | null; end_time: string | null; reason: string | null; created_at: string }, "date">;
      appointments: Table<Appointment, "patient_id" | "appointment_date" | "start_time" | "end_time", [{ foreignKeyName: "appointments_patient_id_fkey"; columns: ["patient_id"]; isOneToOne: false; referencedRelation: "patients"; referencedColumns: ["id"] }]>;
      payments: Table<Payment, "appointment_id" | "amount", [{ foreignKeyName: "payments_appointment_id_fkey"; columns: ["appointment_id"]; isOneToOne: false; referencedRelation: "appointments"; referencedColumns: ["id"] }]>;
      reviews: Table<Review, "appointment_id" | "patient_id" | "rating", [
        { foreignKeyName: "reviews_appointment_id_fkey"; columns: ["appointment_id"]; isOneToOne: true; referencedRelation: "appointments"; referencedColumns: ["id"] },
        { foreignKeyName: "reviews_patient_id_fkey"; columns: ["patient_id"]; isOneToOne: false; referencedRelation: "patients"; referencedColumns: ["id"] }
      ]>;
      settings: Table<Settings, "clinic_name">;
      otp_codes: Table<{ id: string; phone: string; code_hash: string; expires_at: string; attempts: number; created_at: string; consumed_at: string | null }, "phone" | "code_hash" | "expires_at">;
    };
    Views: Record<string, never>;
    Functions: {
      get_dashboard_stats: { Args: Record<string, never>; Returns: { total_appointments: number; completed_appointments: number; cancelled_appointments: number; no_show_appointments: number; cancellation_rate: number | null; total_revenue: number; revenue_this_month: number; average_rating: number | null; reviews_count: number }[] };
      create_patient_appointment: { Args: { p_patient_id: string; p_date: string; p_start_time: string; p_end_time: string; p_reason?: string | null; p_patient_name?: string | null; p_patient_email?: string | null }; Returns: string };
      cancel_patient_appointment: { Args: { p_appointment_id: string; p_patient_id: string }; Returns: string };
      issue_otp: { Args: { p_phone: string; p_code_hash: string }; Returns: Json };
      verify_otp: { Args: { p_phone: string; p_code_hash: string }; Returns: Json };
      begin_payment_attempt: { Args: { p_appointment_id: string; p_patient_id: string }; Returns: Json };
      claim_appointment_reminders: { Args: Record<string, never>; Returns: { id: string; appointment_date: string; start_time: string; patient_name: string | null; phone: string; claim_token: string }[] };
      apply_paymob_transaction: { Args: { p_order_id: string; p_transaction_id: string; p_amount_cents: number; p_success: boolean }; Returns: Json };
    };
    Enums: { appointment_status: AppointmentStatus; payment_status: PaymentStatus };
    CompositeTypes: Record<string, never>;
  };
};
