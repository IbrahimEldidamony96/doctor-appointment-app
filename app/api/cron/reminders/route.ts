import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const REMINDER_WINDOW_HOURS = 24;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

  // Coarse date-only filter to narrow the query — precise datetime
  // filtering happens below, since a date can span partly outside
  // the reminder window.
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id, appointment_date, start_time, patients(name, phone)")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("appointment_date", now.toISOString().slice(0, 10))
    .lte("appointment_date", windowEnd.toISOString().slice(0, 10));

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const appt of appointments ?? []) {
    const apptDateTime = new Date(`${appt.appointment_date}T${appt.start_time}`);

    if (apptDateTime < now || apptDateTime > windowEnd) continue;

    const phone = appt.patients?.phone;
    if (!phone) continue;

    try {
      await sendWhatsAppMessage(
        phone,
        `تذكير: عندك موعد يوم ${appt.appointment_date} الساعة ${appt.start_time.slice(0, 5)}`
      );
      await supabase
        .from("appointments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", appt.id);
      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, checked: appointments?.length ?? 0 });
}
