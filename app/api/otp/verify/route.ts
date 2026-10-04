import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifyOtp } from "@/lib/auth/otp";
import { signPatientJwt } from "@/lib/auth/patient-jwt";
import { createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().length(6),
});

const PATIENT_SESSION_COOKIE = "patient_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { phone, code } = parsed.data;

  const result = await verifyOtp(phone, code);
  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  const supabase = createServiceClient();

  let { data: patient } = await supabase
    .from("patients")
    .select("id, phone")
    .eq("phone", phone)
    .is("deleted_at", null)
    .maybeSingle();

  let isNewPatient = false;

  if (!patient) {
    const { data: newPatient, error } = await supabase
      .from("patients")
      .insert({ phone })
      .select("id, phone")
      .single();

    if (error || !newPatient) {
      return NextResponse.json(
        { error: "patient_creation_failed" },
        { status: 500 }
      );
    }

    patient = newPatient;
    isNewPatient = true;
  }

  const token = await signPatientJwt({
    patientId: patient.id,
    phone: patient.phone,
  });

  const cookieStore = await cookies(); // async in Next.js 15
  cookieStore.set(PATIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return NextResponse.json({ success: true, isNewPatient });
}
