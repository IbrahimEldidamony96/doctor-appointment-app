import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifyOtp } from "@/lib/auth/otp";
import { signPatientJwt } from "@/lib/auth/patient-jwt";
import { PATIENT_SESSION_COOKIE, PATIENT_SESSION_MAX_AGE_SECONDS, PHONE_PATTERN } from "@/lib/auth/constants";
import { createServiceClient } from "@/lib/supabase/server";

const schema = z.object({ phone: z.string().regex(PHONE_PATTERN), code: z.string().regex(/^\d{6}$/) });

export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const { phone, code } = parsed.data;
    const result = await verifyOtp(phone, code);
    if (!result.success) return NextResponse.json({ error: result.reason }, { status: 401 });

    const supabase = createServiceClient();
    let { data: patient, error: lookupError } = await supabase
      .from("patients").select("id, phone").eq("phone", phone).is("deleted_at", null).maybeSingle();
    if (lookupError) throw lookupError;
    let isNewPatient = false;
    if (!patient) {
      const created = await supabase.from("patients").insert({ phone }).select("id, phone").single();
      if (created.data) { patient = created.data; isNewPatient = true; }
      else if (created.error?.code === "23505") {
        // Concurrent verification/registration: unique phone wins.
        const retried = await supabase.from("patients").select("id, phone")
          .eq("phone", phone).is("deleted_at", null).maybeSingle();
        if (retried.error || !retried.data) throw new Error("Patient unavailable");
        patient = retried.data;
      } else throw new Error("Patient creation failed");
    }
    const jwt = await signPatientJwt({ patientId: patient.id, phone: patient.phone });
    (await cookies()).set(PATIENT_SESSION_COOKIE, jwt, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: PATIENT_SESSION_MAX_AGE_SECONDS,
    });
    return NextResponse.json({ success: true, isNewPatient }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "otp_service_unavailable" }, { status: 503 });
  }
}
