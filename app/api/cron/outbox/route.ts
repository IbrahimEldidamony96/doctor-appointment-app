import { NextRequest, NextResponse } from "next/server";
import { processNotificationOutbox } from "@/lib/notification-outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const token = process.env.CRON_SECRET;
  if (!token || request.headers.get("authorization") !== "Bearer " + token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const report = await processNotificationOutbox(4);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "notification_outbox_unavailable" }, { status: 503 });
  }
}
