import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendOtp } from "@/lib/auth/otp";
import { PHONE_PATTERN } from "@/lib/auth/constants";

const schema = z.object({ phone: z.string().regex(PHONE_PATTERN) });

export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  try {
    const result = await sendOtp(parsed.data.phone);
    if (!result.success) {
      return NextResponse.json({ error: result.reason, retryAfter: result.retryAfter }, {
        status: 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "otp_service_unavailable" }, { status: 503 });
  }
}
