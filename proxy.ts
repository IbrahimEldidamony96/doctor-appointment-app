import { NextRequest, NextResponse } from "next/server";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/constants";
import { verifyPatientJwt } from "@/lib/auth/patient-jwt";
import { safeLoginRedirect } from "@/lib/auth/safe-redirect";

export default async function proxy(req: NextRequest) {
  const token = req.cookies.get(PATIENT_SESSION_COOKIE)?.value;
  const identity = token ? await verifyPatientJwt(token) : null;
  if (!identity) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", safeLoginRedirect(req.nextUrl.pathname + req.nextUrl.search));
    return NextResponse.redirect(loginUrl);
  }
  // This is an identity check. Pages and every mutation re-read current clinic permissions.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/book/:path*", "/my-appointments/:path*", "/payment/:path*", "/profile/:path*"],
};
