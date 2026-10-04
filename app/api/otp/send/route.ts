import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendOtp } from "@/lib/auth/otp";
import { createServiceClient } from "@/lib/supabase/server";

const SEND_COOLDOWN_SECONDS = 60;

const bodySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "invalid phone"), // E.164
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const { phone } = parsed.data;
  const supabase = createServiceClient();

  // Simple resend cooldown — block a new send within SEND_COOLDOWN_SECONDS
  // of the last one for this phone.
  const { data: recent } = await supabase
    .from("otp_codes")
    .select("created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const secondsSince =
      (Date.now() - new Date(recent.created_at).getTime()) / 1000;

    if (secondsSince < SEND_COOLDOWN_SECONDS) {
      return NextResponse.json(
        {
          error: "too_many_requests",
          retryAfter: Math.ceil(SEND_COOLDOWN_SECONDS - secondsSince),
        },
        { status: 429 }
      );
    }
  }

  await sendOtp(phone);

  return NextResponse.json({ success: true });
}
