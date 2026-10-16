import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/constants";

export async function POST() {
  (await cookies()).delete(PATIENT_SESSION_COOKIE);
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
