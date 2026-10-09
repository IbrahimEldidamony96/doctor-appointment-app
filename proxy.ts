import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { verifyPatientJwt } from "@/lib/auth/patient-jwt";
import { isAuthorizedDoctor } from "@/lib/auth/doctor-access";

// Doctor routes — protected by Clerk.
const isDoctorRoute = createRouteMatcher(["/dashboard(.*)"]);

// Patient routes that require a signed-in patient. /login and /verify
// stay public — they're the entry points before a session exists.
const isProtectedPatientRoute = createRouteMatcher([
  "/book(.*)",
  "/my-appointments(.*)",
  "/payment(.*)",
  "/profile(.*)",
]);

const PATIENT_SESSION_COOKIE = "patient_session";

export default clerkMiddleware(async (auth, req) => {
  if (isDoctorRoute(req)) {
    await auth.protect();
    const { userId } = await auth();
    if (!isAuthorizedDoctor(userId)) return NextResponse.redirect(new URL("/doctor-access-denied", req.url));
    return;
  }

  if (isProtectedPatientRoute(req)) {
    const token = req.cookies.get(PATIENT_SESSION_COOKIE)?.value;
    const payload = token ? await verifyPatientJwt(token) : null;

    if (!payload) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
});

export const config = {
  matcher: [
    // Run on everything except Next internals and static files
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
