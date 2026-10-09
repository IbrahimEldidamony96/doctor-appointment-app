/** Hand-maintained Supabase types for migrations 001-006. Re-generate with
 * `supabase gen types typescript` after changing the database schema. */
export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

type Table<Row, Insert, Relationships extends readonly unknown[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: Relationships;
};
type Patient = { id: string; phone: string; name: string | null; email: string | null; date_of_birth: string | null; gender: string | null; created_at: string; updated_at: string; deleted_at: string | null };
type Availability = { id: string; day_of_week: number; start_time: string; end_time: string; slot_duration_minutes: number; is_active: boolean; created_at: string };
type BlockedDate = { id: string; date: string; is_full_day: boolean; start_time: string | null; end_time: string | null; reason: string | null; created_at: string };
type Appointment = { id: string; patient_id: string; appointment_date: string; start_time: string; end_time: string; status: AppointmentStatus; reason_for_visit: string | null; notes: string | null; created_at: string; updated_at: string; deleted_at: string | null; reminder_sent_at: string | null };
type Payment = { id: string; appointment_id: string; amount: number; currency: string; provider: string; status: PaymentStatus; transaction_id: string | null; paid_at: string | null; created_at: string };
type Review = { id: string; appointment_id: string; patient_id: string; rating: number; comment: string | null; is_published: boolean; created_at: string };
type Settings = { id: string; clinic_name: string; booking_window_days: number; cancellation_notice_hours: number; default_slot_minutes: number; updated_at: string; doctor_notification_phone: string | null; consultation_price: number | null };
type Otp = { id: string; phone: string; code_hash: string; expires_at: string; attempts: number; created_at: string };

export type Database = {
  clinic: {
    Tables: {
      patients: Table<Patient, Pick<Patient, "phone"> & Partial<Patient>>;
      availability: Table<Availability, Pick<Availability, "day_of_week" | "start_time" | "end_time"> & Partial<Availability>>;
      blocked_dates: Table<BlockedDate, Pick<BlockedDate, "date"> & Partial<BlockedDate>>;
      appointments: Table<Appointment, Pick<Appointment, "patient_id" | "appointment_date" | "start_time" | "end_time"> & Partial<Appointment>, [{ foreignKeyName: "appointments_patient_id_fkey"; columns: ["patient_id"]; isOneToOne: false; referencedRelation: "patients"; referencedColumns: ["id"] }] >;
      payments: Table<Payment, Pick<Payment, "appointment_id" | "amount"> & Partial<Payment>, [{ foreignKeyName: "payments_appointment_id_fkey"; columns: ["appointment_id"]; isOneToOne: false; referencedRelation: "appointments"; referencedColumns: ["id"] }] >;
      reviews: Table<Review, Pick<Review, "appointment_id" | "patient_id" | "rating"> & Partial<Review>, [
        { foreignKeyName: "reviews_appointment_id_fkey"; columns: ["appointment_id"]; isOneToOne: true; referencedRelation: "appointments"; referencedColumns: ["id"] },
        { foreignKeyName: "reviews_patient_id_fkey"; columns: ["patient_id"]; isOneToOne: false; referencedRelation: "patients"; referencedColumns: ["id"] }
      ] >;
      settings: Table<Settings, Pick<Settings, "clinic_name"> & Partial<Settings>>;
      otp_codes: Table<Otp, Pick<Otp, "phone" | "code_hash" | "expires_at"> & Partial<Otp>>;
    };
    Views: Record<never, never>;
    Functions: {
      get_dashboard_stats: { Args: Record<never, never>; Returns: {
        total_appointments: number; completed_appointments: number; cancelled_appointments: number;
        no_show_appointments: number; cancellation_rate: number | null; total_revenue: number;
        revenue_this_month: number; average_rating: number | null; reviews_count: number;
      }[] };
    };
    Enums: { appointment_status: AppointmentStatus; payment_status: PaymentStatus };
    CompositeTypes: Record<never, never>;
  };
};
