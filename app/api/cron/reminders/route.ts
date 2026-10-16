import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendAppointmentReminder } from "@/lib/whatsapp";

// Each SQL claim is atomic; unsuccessful deliveries become retryable when their 15-minute lease expires.
type Claimed = { id: string; appointment_date: string; start_time: string; phone: string; claim_token: string };
const MAX_BATCHES = 4;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createServiceClient();
  let sent = 0;
  let failed = 0;
  let claimed = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await supabase.rpc("claim_appointment_reminders");
    if (error || !data) {
      return NextResponse.json({ error: "reminder_claim_failed", sent, failed, claimed }, { status: 503 });
    }
    if (data.length === 0) break;
    claimed += data.length;
    // Keep provider requests bounded; callback acknowledgement checks the lease token.
    for (const appointment of data as Claimed[]) {
      try {
        if (!appointment.phone) throw new Error("Missing patient contact");
        await sendAppointmentReminder(appointment.phone, appointment.appointment_date, appointment.start_time.slice(0, 5));
        const { data: saved, error: ackError } = await supabase.from("appointments")
          .update({ reminder_sent_at: new Date().toISOString(), reminder_claimed_at: null, reminder_claim_token: null })
          .eq("id", appointment.id).eq("reminder_claim_token", appointment.claim_token)
          .eq("status", "confirmed").is("reminder_sent_at", null)
          .select("id").maybeSingle();
        if (ackError || !saved) throw new Error("Unable to acknowledge reminder");
        sent++;
      } catch {
        // Do not mark as sent. The lease expires after 15 minutes.
        // Delivery is at-least-once, not exactly-once, if WhatsApp succeeds but acknowledgement fails.
        failed++;
      }
    }
    if (data.length < 12) break;
  }
  return NextResponse.json({ sent, failed, claimed }, { headers: { "Cache-Control": "no-store" } });
}
