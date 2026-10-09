import { NextResponse } from "next/server";
import { cookies } from "next/headers";
export async function POST() {
  const store = await cookies();
  store.delete("patient_session");
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
